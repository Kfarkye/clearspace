// source module: live-api.ts
// Interfaces with external live sports data feeds for scores, lineups, and stats.

export interface RawLiveMatchState {
  match_number: number;
  status: 'scheduled' | 'live' | 'finished';
  home_score?: number;
  away_score?: number;
  minute?: number;
  events?: { type: string; team: string; player: string; minute: number }[];
}

export async function fetchRawData(): Promise<string> {
  // Simulates live API-Football or Statorium feed.
  // In a real SRE scenario, this will hit: `https://api-football-v1.p.rapidapi.com/...`
  const liveMatches: RawLiveMatchState[] = [
    {
      match_number: 1, // Mexico vs South Korea
      status: 'finished',
      home_score: 2,
      away_score: 1,
      minute: 90,
      events: [
        { type: 'goal', team: 'MEX', player: 'Santiago Giménez', minute: 24 },
        { type: 'goal', team: 'KOR', player: 'Son Heung-min', minute: 67 },
        { type: 'goal', team: 'MEX', player: 'Hirving Lozano', minute: 82 },
      ],
    },
    {
      match_number: 2, // South Africa vs Czechia
      status: 'finished',
      home_score: 0,
      away_score: 0,
      minute: 90,
      events: [],
    },
    {
      match_number: 19, // USA vs Turkey
      status: 'live',
      home_score: 1,
      away_score: 0,
      minute: 54,
      events: [
        { type: 'goal', team: 'USA', player: 'Christian Pulisic', minute: 41 },
      ],
    },
  ];

  return JSON.stringify({
    source: 'Live Sports Feed API',
    fetched_at: new Date().toISOString(),
    liveMatches,
  });
}
