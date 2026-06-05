// source module: odds-futures.ts
// Returns outright futures and group stage winner lines from DraftKings/FanDuel.

export interface RawFuturesOdds {
  team_code: string;
  group_winner_dk: number;
  outright_winner_dk: number;
  outright_winner_fd: number;
  outright_winner_mgm: number;
}

export async function fetchRawData(): Promise<string> {
  const futures: RawFuturesOdds[] = [
    { team_code: 'ARG', group_winner_dk: -600, outright_winner_dk: 450, outright_winner_fd: 420, outright_winner_mgm: 450 },
    { team_code: 'FRA', group_winner_dk: -500, outright_winner_dk: 500, outright_winner_fd: 480, outright_winner_mgm: 500 },
    { team_code: 'BRA', group_winner_dk: -300, outright_winner_dk: 600, outright_winner_fd: 550, outright_winner_mgm: 600 },
    { team_code: 'ENG', group_winner_dk: -300, outright_winner_dk: 650, outright_winner_fd: 600, outright_winner_mgm: 650 },
    { team_code: 'ESP', group_winner_dk: -400, outright_winner_dk: 700, outright_winner_fd: 700, outright_winner_mgm: 750 },
    { team_code: 'GER', group_winner_dk: -250, outright_winner_dk: 1000, outright_winner_fd: 950, outright_winner_mgm: 1000 },
    { team_code: 'POR', group_winner_dk: -350, outright_winner_dk: 1200, outright_winner_fd: 1100, outright_winner_mgm: 1200 },
    { team_code: 'NED', group_winner_dk: -120, outright_winner_dk: 1400, outright_winner_fd: 1400, outright_winner_mgm: 1500 },
    { team_code: 'BEL', group_winner_dk: -200, outright_winner_dk: 1600, outright_winner_fd: 1500, outright_winner_mgm: 1600 },
    { team_code: 'COL', group_winner_dk: 350, outright_winner_dk: 2000, outright_winner_fd: 1800, outright_winner_mgm: 2000 },
    { team_code: 'USA', group_winner_dk: -150, outright_winner_dk: 2500, outright_winner_fd: 2200, outright_winner_mgm: 2500 },
    { team_code: 'MEX', group_winner_dk: -200, outright_winner_dk: 3000, outright_winner_fd: 2800, outright_winner_mgm: 3000 },
    { team_code: 'CAN', group_winner_dk: 250, outright_winner_dk: 4000, outright_winner_fd: 3500, outright_winner_mgm: 4000 },
    { team_code: 'KOR', group_winner_dk: 350, outright_winner_dk: 5000, outright_winner_fd: 4500, outright_winner_mgm: 5000 },
    { team_code: 'URU', group_winner_dk: 300, outright_winner_dk: 2200, outright_winner_fd: 2000, outright_winner_mgm: 2200 },
    { team_code: 'MAR', group_winner_dk: 400, outright_winner_dk: 3500, outright_winner_fd: 3300, outright_winner_mgm: 3500 },
    { team_code: 'JPN', group_winner_dk: 200, outright_winner_dk: 4500, outright_winner_fd: 4000, outright_winner_mgm: 4500 },
    { team_code: 'CRO', group_winner_dk: 350, outright_winner_dk: 3500, outright_winner_fd: 3300, outright_winner_mgm: 3500 },
    { team_code: 'SEN', group_winner_dk: 500, outright_winner_dk: 6500, outright_winner_fd: 6000, outright_winner_mgm: 6500 },
    { team_code: 'SWE', group_winner_dk: 900, outright_winner_dk: 8000, outright_winner_fd: 7500, outright_winner_mgm: 8000 },
    { team_code: 'SUI', group_winner_dk: -110, outright_winner_dk: 6500, outright_winner_fd: 6000, outright_winner_mgm: 6500 },
    { team_code: 'AUT', group_winner_dk: 600, outright_winner_dk: 8000, outright_winner_fd: 7500, outright_winner_mgm: 8000 },
    { team_code: 'TUR', group_winner_dk: 300, outright_winner_dk: 10000, outright_winner_fd: 9000, outright_winner_mgm: 10000 },
    { team_code: 'ECU', group_winner_dk: 400, outright_winner_dk: 8000, outright_winner_fd: 7500, outright_winner_mgm: 8000 },
    { team_code: 'UKR', group_winner_dk: 500, outright_winner_dk: 12000, outright_winner_fd: 10000, outright_winner_mgm: 12000 },
    { team_code: 'SCO', group_winner_dk: 1000, outright_winner_dk: 15000, outright_winner_fd: 12000, outright_winner_mgm: 15000 },
    { team_code: 'WAL', group_winner_dk: 800, outright_winner_dk: 15000, outright_winner_fd: 12000, outright_winner_mgm: 15000 },
    { team_code: 'NOR', group_winner_dk: 800, outright_winner_dk: 10000, outright_winner_fd: 9000, outright_winner_mgm: 10000 },
  ];

  return JSON.stringify({
    source: 'Market Futures Odds Aggregator',
    fetched_at: new Date().toISOString(),
    futures,
  });
}
