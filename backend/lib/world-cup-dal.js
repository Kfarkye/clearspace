// ============================================================================
// World Cup 2026 — Legacy Spanner Data Access Layer Wrapper
//
// Delegates calls to the unified sports-dal.js with leagueId = 'WORLD_CUP'.
// This ensures backward compatibility while deduplicating logic.
// ============================================================================

import * as sportsDAL from './sports-dal.js';

export async function getTeams(group, includePlaceholders = false) {
  return sportsDAL.getTeams('WORLD_CUP', group, includePlaceholders);
}

export async function getTeam(teamCode) {
  return sportsDAL.getTeam('WORLD_CUP', teamCode);
}

export async function getVenues() {
  return sportsDAL.getVenues();
}

export async function getMatches(filters = {}) {
  return sportsDAL.getMatches('WORLD_CUP', filters);
}

export async function getMatchDetail(matchId) {
  return sportsDAL.getMatchDetail('WORLD_CUP', matchId);
}

export async function getOddsForTeam(teamCode) {
  return sportsDAL.getOddsForTeam('WORLD_CUP', teamCode);
}

export async function getEdges(filters = {}) {
  return sportsDAL.getEdges('WORLD_CUP', filters);
}

export async function getPredictionPrices(filters = {}) {
  return sportsDAL.getPredictionPrices('WORLD_CUP', filters);
}

export async function getGroupSnapshot(groupLetter) {
  return sportsDAL.getGroupSnapshot('WORLD_CUP', groupLetter);
}

export async function getOdds(filters = {}) {
  return sportsDAL.getOdds('WORLD_CUP', filters);
}

export async function closeWcSpanner() {
  return sportsDAL.closeSportsSpanner();
}
