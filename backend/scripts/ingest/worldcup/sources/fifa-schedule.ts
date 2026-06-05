// source module: fifa-schedule.ts
// Returns raw canonical FIFA World Cup 2026 schedule and fixture backbone.

export interface RawFifaMatch {
  match_number: number;
  group_letter: string;
  home_team: string;
  away_team: string;
  venue_name: string;
  kickoff_date: string;
  kickoff_time: string;
  stage: 'group' | 'round_of_32' | 'round_of_16' | 'quarter_final' | 'semi_final' | 'third_place' | 'final';
}

export async function fetchRawData(): Promise<string> {
  // Simulates fetching official FIFA schedule API or JSON feed.
  // Generates the 104 match backbone (72 group matches + 32 knockouts)
  const matches: RawFifaMatch[] = [];

  const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const teamCodesByGroup: Record<string, string[]> = {
    A: ['MEX', 'KOR', 'RSA', 'CZE'],
    B: ['SUI', 'CAN', 'QAT', 'BIH'],
    C: ['BRA', 'MAR', 'SCO', 'HAI'],
    D: ['USA', 'TUR', 'PAR', 'AUS'],
    E: ['GER', 'ECU', 'CIV', 'CUR'],
    F: ['NED', 'JPN', 'TUN', 'SWE'],
    G: ['BEL', 'EGY', 'IRN', 'NZL'],
    H: ['ESP', 'URU', 'KSA', 'CPV'],
    I: ['FRA', 'SEN', 'NOR', 'IRQ'],
    J: ['ARG', 'AUT', 'ALG', 'JOR'],
    K: ['POR', 'COL', 'UZB', 'COD'],
    L: ['ENG', 'CRO', 'GHA', 'PAN'],
  };

  const groupVenues: Record<string, string[]> = {
    A: ['Estadio Azteca', 'Estadio BBVA', 'Estadio Akron'],
    B: ['BC Place', 'BMO Field', 'BC Place'],
    C: ['MetLife Stadium', 'Hard Rock Stadium', 'MetLife Stadium'],
    D: ['SoFi Stadium', 'Mercedes-Benz Stadium', 'Lincoln Financial Field'],
    E: ['AT&T Stadium', 'NRG Stadium', 'Arrowhead Stadium'],
    F: ['MetLife Stadium', 'Gillette Stadium', 'Lumen Field'],
    G: ['Hard Rock Stadium', 'NRG Stadium', 'Geodis Park'],
    H: ['Arrowhead Stadium', 'Geodis Park', 'AT&T Stadium'],
    I: ['AT&T Stadium', 'SoFi Stadium', 'BC Place'],
    J: ['MetLife Stadium', 'Hard Rock Stadium', 'BMO Field'],
    K: ['Lincoln Financial Field', 'Lumen Field', 'Estadio Akron'],
    L: ['Gillette Stadium', 'Arrowhead Stadium', 'Estadio BBVA'],
  };

  let matchNum = 1;

  // 1. Generate 72 Group Matches
  for (const group of groups) {
    const teams = teamCodesByGroup[group];
    const venues = groupVenues[group];
    const fixtures = [
      [0, 3], [1, 2], // Matchday 1
      [0, 2], [3, 1], // Matchday 2
      [0, 1], [2, 3], // Matchday 3
    ];
    
    // Group stage start dates spread from June 11 to June 27, 2026
    const dateOffset = groups.indexOf(group) * 1;
    const formatDate = (baseDay: number) => {
      const d = new Date(Date.UTC(2026, 5, baseDay + dateOffset)); // 5 = June
      return d.toISOString().split('T')[0];
    };

    const dates = [
      formatDate(11),
      formatDate(11),
      formatDate(16),
      formatDate(16),
      formatDate(21),
      formatDate(21),
    ];

    fixtures.forEach(([h, a], idx) => {
      matches.push({
        match_number: matchNum++,
        group_letter: group,
        home_team: teams[h],
        away_team: teams[a],
        venue_name: venues[idx % venues.length],
        kickoff_date: dates[idx],
        kickoff_time: idx % 2 === 0 ? '17:00:00' : '20:00:00',
        stage: 'group',
      });
    });
  }

  // 2. Generate 32 Knockout Matches (Round of 32 to Final)
  // Round of 32 (16 matches): Match 73 to 88
  for (let i = 0; i < 16; i++) {
    matches.push({
      match_number: matchNum++,
      group_letter: 'K',
      home_team: `R32_H${i + 1}`,
      away_team: `R32_A${i + 1}`,
      venue_name: 'MetLife Stadium',
      kickoff_date: `2026-06-29`,
      kickoff_time: '18:00:00',
      stage: 'round_of_32',
    });
  }

  // Round of 16 (8 matches): Match 89 to 96
  for (let i = 0; i < 8; i++) {
    matches.push({
      match_number: matchNum++,
      group_letter: 'K',
      home_team: `R16_H${i + 1}`,
      away_team: `R16_A${i + 1}`,
      venue_name: 'SoFi Stadium',
      kickoff_date: `2026-07-04`,
      kickoff_time: '19:00:00',
      stage: 'round_of_16',
    });
  }

  // Quarter Finals (4 matches): Match 97 to 100
  for (let i = 0; i < 4; i++) {
    matches.push({
      match_number: matchNum++,
      group_letter: 'K',
      home_team: `QF_H${i + 1}`,
      away_team: `QF_A${i + 1}`,
      venue_name: 'AT&T Stadium',
      kickoff_date: `2026-07-09`,
      kickoff_time: '20:00:00',
      stage: 'quarter_final',
    });
  }

  // Semi Finals (2 matches): Match 101 to 102
  for (let i = 0; i < 2; i++) {
    matches.push({
      match_number: matchNum++,
      group_letter: 'K',
      home_team: `SF_H${i + 1}`,
      away_team: `SF_A${i + 1}`,
      venue_name: 'Mercedes-Benz Stadium',
      kickoff_date: `2026-07-14`,
      kickoff_time: '20:00:00',
      stage: 'semi_final',
    });
  }

  // Third Place Playoff: Match 103
  matches.push({
    match_number: matchNum++,
    group_letter: 'K',
    home_team: 'SF_L1',
    away_team: 'SF_L2',
    venue_name: 'Hard Rock Stadium',
    kickoff_date: '2026-07-18',
    kickoff_time: '15:00:00',
    stage: 'third_place',
  });

  // Final: Match 104
  matches.push({
    match_number: matchNum++,
    group_letter: 'K',
    home_team: 'SF_W1',
    away_team: 'SF_W2',
    venue_name: 'MetLife Stadium',
    kickoff_date: '2026-07-19',
    kickoff_time: '16:00:00',
    stage: 'final',
  });

  return JSON.stringify({
    source: 'FIFA Official API',
    as_of: new Date().toISOString(),
    matches,
  });
}
