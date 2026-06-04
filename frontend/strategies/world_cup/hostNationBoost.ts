/**
 * Host Nation Boost Strategy — World Cup
 *
 * Host nations historically outperform their odds in the group stage.
 * Crowd support, no travel, and familiarity with conditions create
 * a measurable edge, especially in early tournament games.
 *
 * 2026 World Cup: USA, Mexico, Canada (tri-host).
 * This dilutes the traditional single-host advantage but each still
 * benefits from home-venue games.
 *
 * Model Weights (tune after tracking results):
 * - Group stage win probability boost for host nations
 * - Fatigued team derivative multiplier (opponents traveling to host)
 *
 * Record: Pending (tracking starts June 2026)
 * ROI: Pending
 */

import {
  WC_HOST_NATIONS,
  WC_GROUP_STAGE_EARLY_GAMES_COUNT,
  WC_TEAM_FORM_WEIGHTING_MATCHES,
} from '../../constants/world_cup';

// --- Model Weights (tunable) ---

// Win probability boost for a host nation playing a group stage game at home.
export const WC_HOST_NATION_GROUP_STAGE_WIN_PROB_BOOST_PERCENTAGE = 0.05; // 5% boost

// Multiplier for opponent fatigue when traveling to a host nation venue.
// Captures jet lag, altitude (e.g., Mexico City), and crowd pressure.
export const WC_FATIGUED_TEAM_DERIVATIVE_MULTIPLIER = 1.15; // 15% fatigue penalty on opponent

// --- Strategy Interface ---

export interface HostNationBoostInput {
  hostTeam: string;
  opponent: string;
  venue: string;
  venueCountry: string;          // ISO country code for venue
  matchNumber: number;           // 1, 2, or 3 in group stage
  hostBaseWinProb: number;
  opponentBaseWinProb: number;
  isOpponentTraveling: boolean;  // True if opponent traveled internationally
  opponentTravelDistance: number; // Approximate km traveled
}

export interface HostNationBoostOutput {
  strategy: 'host_nation_boost';
  isHostNation: boolean;
  boostApplied: boolean;
  fatigueApplied: boolean;
  adjustedHostWinProb: number;
  adjustedOpponentWinProb: number;
  edge: string | null;
}

/**
 * Evaluates host nation advantage for a World Cup match.
 */
export function evaluateHostNationBoost(input: HostNationBoostInput): HostNationBoostOutput {
  const isHostNation = WC_HOST_NATIONS.includes(input.venueCountry);
  let adjustedHost = input.hostBaseWinProb;
  let adjustedOpponent = input.opponentBaseWinProb;
  let boostApplied = false;
  let fatigueApplied = false;
  let edge: string | null = null;

  if (!isHostNation) {
    return {
      strategy: 'host_nation_boost',
      isHostNation: false,
      boostApplied: false,
      fatigueApplied: false,
      adjustedHostWinProb: input.hostBaseWinProb,
      adjustedOpponentWinProb: input.opponentBaseWinProb,
      edge: null,
    };
  }

  // Apply host boost for group stage games
  if (input.matchNumber <= WC_GROUP_STAGE_EARLY_GAMES_COUNT + 1) {
    adjustedHost += WC_HOST_NATION_GROUP_STAGE_WIN_PROB_BOOST_PERCENTAGE;
    boostApplied = true;
  }

  // Apply opponent travel fatigue
  if (input.isOpponentTraveling && input.opponentTravelDistance > 3000) {
    adjustedOpponent /= WC_FATIGUED_TEAM_DERIVATIVE_MULTIPLIER;
    fatigueApplied = true;
  }

  // Normalize probabilities (ensure they don't exceed 1.0 combined with draw)
  const drawProb = Math.max(0, 1 - adjustedHost - adjustedOpponent);

  if (boostApplied || fatigueApplied) {
    const parts: string[] = [];
    if (boostApplied) parts.push(`${input.hostTeam} playing at home in ${input.venue}`);
    if (fatigueApplied) parts.push(`${input.opponent} traveled ${input.opponentTravelDistance.toLocaleString()}km`);
    edge = parts.join('; ');
  }

  return {
    strategy: 'host_nation_boost',
    isHostNation,
    boostApplied,
    fatigueApplied,
    adjustedHostWinProb: adjustedHost,
    adjustedOpponentWinProb: adjustedOpponent,
    edge,
  };
}
