/**
 * Defending Champion Fade Strategy — World Cup
 *
 * Historical pattern: defending World Cup champions underperform expectations
 * in the following tournament. This strategy applies a probability reduction
 * to the defending champion's win odds.
 *
 * Historical basis: Since 1998, defending champions have been eliminated
 * in the group stage 3 out of 6 times.
 *
 * Model Weights (tune after tracking results):
 * - Fade factor reduces win probability for the defending champion
 *
 * Record: Pending (tracking starts June 2026)
 * ROI: Pending
 */

import {
  WC_TEAM_FORM_WEIGHTING_MATCHES,
  WC_EXPECTED_GOALS_DIFFERENCE_THRESHOLD,
} from '../../constants/world_cup';

// --- Model Weights (tunable) ---

// Multiplier applied to defending champion's win probability (< 1.0 = fade).
// Based on historical underperformance of defending champions.
export const WC_DEFENDING_CHAMPION_FADE_FACTOR = 0.90; // 10% reduction

// --- Strategy Interface ---

export interface DefendingChampionFadeInput {
  team: string;
  isDefendingChampion: boolean;
  recentFormXG: number;           // Average xG differential in recent matches
  baseWinProb: number;            // Pre-adjustment probability
  opponent: string;
  opponentBaseWinProb: number;
}

export interface DefendingChampionFadeOutput {
  strategy: 'defending_champion_fade';
  fadeApplied: boolean;
  adjustedWinProb: number;
  adjustedOpponentWinProb: number;
  edge: string | null;
}

/**
 * Evaluates whether to fade the defending champion in a World Cup match.
 */
export function evaluateDefendingChampionFade(
  input: DefendingChampionFadeInput,
): DefendingChampionFadeOutput {
  let adjustedWin = input.baseWinProb;
  let fadeApplied = false;
  let edge: string | null = null;

  if (input.isDefendingChampion) {
    adjustedWin *= WC_DEFENDING_CHAMPION_FADE_FACTOR;
    fadeApplied = true;

    // Stronger fade if recent form doesn't back up their ranking
    if (input.recentFormXG < WC_EXPECTED_GOALS_DIFFERENCE_THRESHOLD) {
      edge = `${input.team} (defending champion) showing weak xG form (${input.recentFormXG.toFixed(2)} differential). Historical pattern + form decline = fade.`;
    } else {
      edge = `${input.team} (defending champion) faded per historical pattern. Form is decent but champions curse applies.`;
    }
  }

  const adjustedOpponent = fadeApplied
    ? input.opponentBaseWinProb + (input.baseWinProb - adjustedWin) * 0.7 // Redistribute ~70% to opponent
    : input.opponentBaseWinProb;

  return {
    strategy: 'defending_champion_fade',
    fadeApplied,
    adjustedWinProb: adjustedWin,
    adjustedOpponentWinProb: Math.min(adjustedOpponent, 0.85),
    edge,
  };
}
