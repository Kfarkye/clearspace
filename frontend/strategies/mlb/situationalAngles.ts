/**
 * Situational Angles Strategy — MLB
 *
 * Identifies edges from situational mismatches: fading weak road teams,
 * exploiting bullpen fatigue, and high-total underdog value.
 *
 * Model Weights (tune after tracking results):
 * - Fade weak road team reduces implied win probability
 *
 * Record: Pending (tracking starts June 2026)
 * ROI: Pending
 */

import {
  MLB_HIGH_TOTAL_GAME_THRESHOLD,
  MLB_UNDERDOG_HIGH_TOTAL_MIN_ODDS,
  MLB_UNDERDOG_HIGH_TOTAL_MAX_ODDS,
  MLB_BULLPEN_FORM_WEIGHT_GAMES,
} from '../../constants/mlb';
import {
  VALUE_BETTING_THRESHOLD_PERCENTAGE,
  DEFAULT_PRIORITIZE_PLUS_MONEY_UNDERDOGS,
} from '../../constants/general';

// --- Model Weights (tunable) ---

// Multiplier applied to a weak road team's win probability (< 1.0 = fade).
export const MLB_FADE_WEAK_ROAD_TEAM_ADJUSTMENT = 0.95;

// --- Strategy Interface ---

export interface SituationalAnglesInput {
  awayTeam: string;
  homeTeam: string;
  awayRoadRecord: { wins: number; losses: number };
  totalLine: number;
  underdogMoneyline: number;
  underdogTeam: 'home' | 'away';
  homeRecentBullpenERA: number;
  awayRecentBullpenERA: number;
  baseWinProbHome: number;
}

export interface SituationalAngle {
  name: string;
  description: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface SituationalAnglesOutput {
  strategy: 'situational_angles';
  angles: SituationalAngle[];
  adjustedWinProbHome: number;
  adjustedWinProbAway: number;
}

/**
 * Evaluates situational angles for a given MLB matchup.
 */
export function evaluateSituationalAngles(input: SituationalAnglesInput): SituationalAnglesOutput {
  const angles: SituationalAngle[] = [];
  let adjustedHome = input.baseWinProbHome;

  // Angle 1: Fade weak road team
  const awayRoadGames = input.awayRoadRecord.wins + input.awayRoadRecord.losses;
  const awayRoadWinPct = awayRoadGames > 0
    ? input.awayRoadRecord.wins / awayRoadGames
    : 0.5;

  if (awayRoadWinPct < 0.400 && awayRoadGames >= 15) {
    adjustedHome /= MLB_FADE_WEAK_ROAD_TEAM_ADJUSTMENT; // Boost home since away is weak
    angles.push({
      name: 'Fade Weak Road Team',
      description: `${input.awayTeam} is ${input.awayRoadRecord.wins}-${input.awayRoadRecord.losses} on the road (.${Math.round(awayRoadWinPct * 1000)}). Fading.`,
      confidence: 'medium',
    });
  }

  // Angle 2: High-total underdog value
  if (
    input.totalLine >= MLB_HIGH_TOTAL_GAME_THRESHOLD &&
    input.underdogMoneyline >= MLB_UNDERDOG_HIGH_TOTAL_MIN_ODDS &&
    input.underdogMoneyline <= MLB_UNDERDOG_HIGH_TOTAL_MAX_ODDS
  ) {
    angles.push({
      name: 'High-Total Underdog',
      description: `Total at ${input.totalLine} with ${input.underdogTeam === 'home' ? input.homeTeam : input.awayTeam} at +${input.underdogMoneyline}. High-scoring games favor underdogs with variance.`,
      confidence: 'medium',
    });
  }

  // Angle 3: Bullpen fatigue mismatch
  const bullpenGap = Math.abs(input.homeRecentBullpenERA - input.awayRecentBullpenERA);
  if (bullpenGap > 1.5) {
    const strongBullpen = input.homeRecentBullpenERA < input.awayRecentBullpenERA ? 'home' : 'away';
    const strongTeam = strongBullpen === 'home' ? input.homeTeam : input.awayTeam;
    const weakTeam = strongBullpen === 'home' ? input.awayTeam : input.homeTeam;
    angles.push({
      name: 'Bullpen Fatigue Mismatch',
      description: `${strongTeam} bullpen ERA ${bullpenGap.toFixed(2)} lower than ${weakTeam} over last ${MLB_BULLPEN_FORM_WEIGHT_GAMES} games. Late-game edge.`,
      confidence: bullpenGap > 2.5 ? 'high' : 'medium',
    });
  }

  return {
    strategy: 'situational_angles',
    angles,
    adjustedWinProbHome: Math.min(adjustedHome, 0.85),
    adjustedWinProbAway: 1 - Math.min(adjustedHome, 0.85),
  };
}
