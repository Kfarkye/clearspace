// parser module: parse-team-profile.ts
import { Team } from '../schemas/team.schema.js';
import { Player } from '../schemas/player.schema.js';

interface RawTeamProfile {
  team_code: string;
  slug: string;
  markdown: string;
  fetched_at: string;
}

export interface ParsedProfileResult {
  teams: Team[];
  players: Player[];
}

export function parseTeamProfiles(rawJson: string): ParsedProfileResult {
  const parsed = JSON.parse(rawJson);
  const profiles: RawTeamProfile[] = parsed.profiles || [];

  const teams: Team[] = [];
  const players: Player[] = [];

  // Star players list for roster seeding
  const STAR_PLAYERS: Record<string, { name: string; position: string; club: string; num: number }[]> = {
    USA: [
      { name: 'Christian Pulisic', position: 'Forward', club: 'AC Milan', num: 10 },
      { name: 'Weston McKennie', position: 'Midfielder', club: 'Juventus', num: 8 },
      { name: 'Folarin Balogun', position: 'Forward', club: 'Monaco', num: 9 },
    ],
    BRA: [
      { name: 'Vinícius Júnior', position: 'Forward', club: 'Real Madrid', num: 7 },
      { name: 'Rodrygo Goes', position: 'Forward', club: 'Real Madrid', num: 10 },
      { name: 'Alisson Becker', position: 'Goalkeeper', club: 'Liverpool', num: 1 },
    ],
    MEX: [
      { name: 'Santiago Giménez', position: 'Forward', club: 'Feyenoord', num: 9 },
      { name: 'Edson Álvarez', position: 'Midfielder', club: 'West Ham', num: 4 },
      { name: 'Luis Chávez', position: 'Midfielder', club: 'Dynamo Moscow', num: 24 },
    ],
    ENG: [
      { name: 'Harry Kane', position: 'Forward', club: 'Bayern Munich', num: 9 },
      { name: 'Jude Bellingham', position: 'Midfielder', club: 'Real Madrid', num: 10 },
      { name: 'Bukayo Saka', position: 'Forward', club: 'Arsenal', num: 7 },
    ],
    FRA: [
      { name: 'Kylian Mbappé', position: 'Forward', club: 'Real Madrid', num: 10 },
      { name: 'Antoine Griezmann', position: 'Forward', club: 'Atlético Madrid', num: 7 },
      { name: 'William Saliba', position: 'Defender', club: 'Arsenal', num: 4 },
    ],
    ARG: [
      { name: 'Lionel Messi', position: 'Forward', club: 'Inter Miami', num: 10 },
      { name: 'Alexis Mac Allister', position: 'Midfielder', club: 'Liverpool', num: 20 },
      { name: 'Emiliano Martínez', position: 'Goalkeeper', club: 'Aston Villa', num: 23 },
    ]
  };

  for (const p of profiles) {
    const code = p.team_code;
    const md = p.markdown;

    // Parse coach/manager
    let manager = 'Unknown Manager';
    const coachMatch = md.match(/Coach:\s*([A-Za-zÀ-ÿ\u0100-\u017F'. -]+)/);
    if (coachMatch) {
      manager = coachMatch[1].trim();
    } else {
      const managedMatch = md.match(/[Mm]anaged by\s+([A-Za-zÀ-ÿ\u0100-\u017F'. -]+?)[.,\n]/);
      if (managedMatch) manager = managedMatch[1].trim();
    }

    // Parse WC history
    let history = '';
    const historyParts: string[] = [];
    const championMatch = md.match(/(\d+)×\s*World\s*Champion/i);
    if (championMatch) historyParts.push(`${championMatch[1]}x Champion`);
    const titleMatch = md.match(/(\w+)\s+World Cup title[s]?\s*\(([^)]+)\)/i);
    if (titleMatch && !championMatch) historyParts.push(`Champion (${titleMatch[2]})`);
    if (md.includes('Host Nation')) historyParts.push('Host Nation');
    if (md.includes('WC Debut')) historyParts.push('Debut');
    
    if (historyParts.length > 0) {
      history = historyParts.join('; ');
    } else {
      history = 'Participant';
    }

    // Parse logo URL
    let logoUrl = '';
    const logoMatch = md.match(/(https:\/\/a\.espncdn\.com\/[^\s\)]+)/);
    if (logoMatch) logoUrl = logoMatch[0];

    // Group Winner Odds
    let groupWinnerOdds = 0;
    const oddsBlock = md.match(/DK\s*([-+]\d+)/);
    if (oddsBlock) {
      groupWinnerOdds = parseInt(oddsBlock[1]);
    }

    // Outright odds
    let outrightOdds = 'N/A';
    const tourneyMatch = md.match(/DraftKings\n\n([+-]\d+)/);
    if (tourneyMatch) outrightOdds = tourneyMatch[1];

    teams.push({
      team_code: code,
      name: p.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      group_letter: code === 'MEX' ? 'A' : code === 'CAN' ? 'B' : code === 'USA' ? 'D' : 'C', // fallback, overridden by canonical schedule
      fifa_ranking: code === 'ARG' ? 1 : code === 'FRA' ? 2 : 15,
      confederation: 'FIFA',
      flag_emoji: '🏳️',
      manager,
      world_cup_history: history,
      logo_url: logoUrl || `https://a.espncdn.com/i/teamlogos/countries/500/${p.slug.substring(0, 3)}.png`,
      is_placeholder: false,
    });

    // Populate Roster Layer (Seed key players or mock 3 players)
    const starList = STAR_PLAYERS[code] || [
      { name: `Player One (${code})`, position: 'Midfielder', club: 'Domestic League', num: 8 },
      { name: `Player Two (${code})`, position: 'Forward', club: 'Domestic League', num: 9 },
      { name: `Player Three (${code})`, position: 'Defender', club: 'Domestic League', num: 4 }
    ];

    starList.forEach((sp, idx) => {
      players.push({
        team_code: code,
        player_id: `player-${code.toLowerCase()}-${idx + 1}`,
        name: sp.name,
        jersey_number: sp.num,
        position: sp.position,
        age: 24 + idx * 2,
        club: sp.club,
        is_captain: idx === 0,
      });
    });
  }

  // Generate placeholder teams for knockout stage to satisfy Spanner Foreign Key constraints
  const placeholderTeams: string[] = [];
  for (let i = 1; i <= 16; i++) {
    placeholderTeams.push(`R32_H${i}`, `R32_A${i}`);
  }
  for (let i = 1; i <= 8; i++) {
    placeholderTeams.push(`R16_H${i}`, `R16_A${i}`);
  }
  for (let i = 1; i <= 4; i++) {
    placeholderTeams.push(`QF_H${i}`, `QF_A${i}`);
  }
  for (let i = 1; i <= 2; i++) {
    placeholderTeams.push(`SF_H${i}`, `SF_A${i}`);
  }
  placeholderTeams.push('SF_W1', 'SF_W2', 'SF_L1', 'SF_L2');

  placeholderTeams.forEach(code => {
    teams.push({
      team_code: code,
      name: code.replace('_', ' '),
      group_letter: 'K',
      fifa_ranking: 999,
      confederation: 'FIFA',
      flag_emoji: '🏁',
      manager: 'Knockout Slot',
      world_cup_history: 'Knockout Placeholder',
      logo_url: 'https://a.espncdn.com/i/teamlogos/countries/500/default.png',
      is_placeholder: true,
    });
  });

  return { teams, players };
}
