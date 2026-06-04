/**
 * Strategy Backtest Record — MLB Travel Fatigue
 *
 * Tracks performance of the Travel Fatigue strategy over time.
 * Update this file after each evaluation window.
 */

export interface BacktestEntry {
  date: string;        // ISO date of the game
  matchup: string;     // e.g., "LAD @ NYM"
  prediction: string;  // e.g., "Fade LAD (travel fatigue)"
  result: 'W' | 'L' | 'P'; // Win, Loss, Push
  odds: number;        // Moneyline played
  units: number;       // Units wagered (theoretical)
  profit: number;      // Units won/lost
}

export interface StrategyBacktest {
  strategyName: string;
  sport: string;
  lastUpdated: string;
  record: { wins: number; losses: number; pushes: number };
  roi: number;         // Percentage
  entries: BacktestEntry[];
}

// --- Current Record ---

export const MLB_TRAVEL_FATIGUE_BACKTEST: StrategyBacktest = {
  strategyName: 'Travel Fatigue',
  sport: 'MLB',
  lastUpdated: '2026-06-01',
  record: { wins: 0, losses: 0, pushes: 0 },
  roi: 0,
  entries: [],
};

export const MLB_SITUATIONAL_ANGLES_BACKTEST: StrategyBacktest = {
  strategyName: 'Situational Angles',
  sport: 'MLB',
  lastUpdated: '2026-06-01',
  record: { wins: 0, losses: 0, pushes: 0 },
  roi: 0,
  entries: [],
};
