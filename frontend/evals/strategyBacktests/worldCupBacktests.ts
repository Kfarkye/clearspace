/**
 * Strategy Backtest Record — World Cup
 *
 * Tracks performance of World Cup strategies over the tournament.
 * Update this file after each matchday.
 */

import type { StrategyBacktest } from './mlbBacktests';

// --- Current Records ---

export const WC_DEFENDING_CHAMPION_FADE_BACKTEST: StrategyBacktest = {
  strategyName: 'Defending Champion Fade',
  sport: 'World Cup',
  lastUpdated: '2026-06-01',
  record: { wins: 0, losses: 0, pushes: 0 },
  roi: 0,
  entries: [],
};

export const WC_HOST_NATION_BOOST_BACKTEST: StrategyBacktest = {
  strategyName: 'Host Nation Boost',
  sport: 'World Cup',
  lastUpdated: '2026-06-01',
  record: { wins: 0, losses: 0, pushes: 0 },
  roi: 0,
  entries: [],
};
