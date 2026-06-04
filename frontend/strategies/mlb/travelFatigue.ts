/**
 * Travel Fatigue Strategy — MLB
 *
 * Identifies edges when teams are traveling across time zones,
 * particularly West Coast → East Coast travel with short rest.
 *
 * Model Weights (tune after tracking results):
 * - WC_TO_EC travel reduction captures jet-lag/rest disadvantage
 * - Back-home favorite adjustment captures comfort/familiarity edge
 *
 * Record: Pending (tracking starts June 2026)
 * ROI: Pending
 */

import {
  MLB_HOME_AWAY_SPLIT_MIN_SAMPLE_SIZE,
  MLB_PITCHER_FORM_WEIGHT_STARTS,
} from '../../constants/mlb';
import {
  DEFAULT_ODDS_PROVIDER,
  RECENT_FORM_WEIGHTING_GAMES,
} from '../../constants/general';

// --- Model Weights (tunable) ---

// Win probability reduction for teams traveling West Coast → East Coast
// with less than 1 day of rest between series.
export const MLB_WC_TO_EC_TRAVEL_FATIGUE_WIN_PROB_REDUCTION = 0.08;

// Win probability boost for a favorite returning home after a road trip.
export const MLB_BACK_HOME_FAVORITE_ADJUSTMENT = 1.05;

// --- Strategy Interface ---

export interface TravelFatigueInput {
  awayTeam: string;
  homeTeam: string;
  awayTravelOriginTimezone: string; // e.g., "America/Los_Angeles"
  homeTimezone: string;             // e.g., "America/New_York"
  awayRestDays: number;
  awayRecentRecord: { wins: number; losses: number };
  homeRecentRecord: { wins: number; losses: number };
  baseWinProbHome: number;          // Pre-adjustment model probability
}

export interface TravelFatigueOutput {
  strategy: 'travel_fatigue';
  adjustedWinProbHome: number;
  adjustedWinProbAway: number;
  fatigueApplied: boolean;
  backHomeBoostApplied: boolean;
  edge: string | null;              // Natural language edge description
}

/**
 * Evaluates travel fatigue angles for a given MLB matchup.
 */
export function evaluateTravelFatigue(input: TravelFatigueInput): TravelFatigueOutput {
  let adjustedHome = input.baseWinProbHome;
  let fatigueApplied = false;
  let backHomeBoostApplied = false;

  // West Coast → East Coast fatigue: away team loses edge
  const isWCtoEC = input.awayTravelOriginTimezone.includes('Los_Angeles') &&
                   input.homeTimezone.includes('New_York');
  if (isWCtoEC && input.awayRestDays < 1) {
    adjustedHome += MLB_WC_TO_EC_TRAVEL_FATIGUE_WIN_PROB_REDUCTION;
    fatigueApplied = true;
  }

  // Back-home favorite boost
  const homeWinPct = input.homeRecentRecord.wins /
    (input.homeRecentRecord.wins + input.homeRecentRecord.losses);
  if (homeWinPct > 0.55 && adjustedHome > 0.50) {
    adjustedHome *= MLB_BACK_HOME_FAVORITE_ADJUSTMENT;
    backHomeBoostApplied = true;
  }

  // Cap at reasonable bounds
  adjustedHome = Math.min(adjustedHome, 0.85);

  const adjustedAway = 1 - adjustedHome;

  let edge: string | null = null;
  if (fatigueApplied || backHomeBoostApplied) {
    const parts: string[] = [];
    if (fatigueApplied) parts.push(`${input.awayTeam} traveling WC→EC on short rest`);
    if (backHomeBoostApplied) parts.push(`${input.homeTeam} back home as favorite`);
    edge = parts.join('; ');
  }

  return {
    strategy: 'travel_fatigue',
    adjustedWinProbHome: adjustedHome,
    adjustedWinProbAway: adjustedAway,
    fatigueApplied,
    backHomeBoostApplied,
    edge,
  };
}
