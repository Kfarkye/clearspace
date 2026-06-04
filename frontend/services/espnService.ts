import { ApiClient } from './apiClient';

const TOOL_TIMEOUT_MS = 10000;

/**
 * ESPN-specific fetch logic.
 * Uses the backend proxy for all ESPN data access.
 */
export const espnService = {
  /**
   * Fetches the scoreboard for a given sport via the backend proxy.
   * Returns site API data enriched with core API odds and win probability.
   */
  getScoreboard: async (sport: string, date?: string) => {
    return ApiClient.sports.getScoreboard(sport, date);
  },

  /**
   * Deep-dive into a specific ESPN event via the core API.
   * Returns detailed odds, win probability, and team stats.
   */
  getEventDetail: async (sport: string, eventId: string) => {
    const response = await fetch(`/api-proxy/espn/${sport}/event/${eventId}`, {
      headers: { 'X-App-Proxy': import.meta.env.VITE_PROXY_HEADER || '' },
      signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`ESPN Core API returned ${response.status}`);
    }
    return response.json();
  },

  /**
   * Fetches play-by-play data for a specific game.
   * Returns game situation (count, baserunners, batter/pitcher), recent plays, and leaders.
   */
  getPlayByPlay: async (sport: string, eventId: string) => {
    const response = await fetch(`/api-proxy/espn/${sport}/event/${eventId}/plays`, {
      headers: { 'X-App-Proxy': import.meta.env.VITE_PROXY_HEADER || '' },
      signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`ESPN play-by-play returned ${response.status}`);
    }
    return response.json();
  },

  /**
   * Fetches live multi-book odds from The Odds API.
   * Returns null if the API key is not configured.
   */
  getLiveOdds: async (sport: string) => {
    try {
      const response = await fetch(`/api-proxy/odds/${sport}`, {
        headers: { 'X-App-Proxy': import.meta.env.VITE_PROXY_HEADER || '' },
        signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
      });

      if (!response.ok) return null;
      const data = await response.json();
      if (!data.configured) return null;
      return data;
    } catch {
      return null;
    }
  },
};
