/**
 * @file frontend/services/espnService.ts
 * @description Unified Sports Service
 * Bridges the frontend directly to the backend's @clearspace/sports-core intelligence layer.
 * 
 * ARCHITECTURE NOTE:
 * - Intelligence endpoints (POST /api/intelligence/sports/*) route through
 *   the backend's production handlers with caching, Kalshi/Polymarket fusion,
 *   and injury data enrichment.
 * - Raw API fallbacks (GET /api-proxy/espn/*) are used for event-specific
 *   deep-dives (game detail, play-by-play) that need ESPN event IDs.
 */

export interface SportsServiceOptions {
  signal?: AbortSignal;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Core fetch wrapper with standard error handling and abort support.
 */
async function fetchApi<T>(url: string, options?: SportsServiceOptions & { method?: string; body?: any }): Promise<T> {
  try {
    const fetchOptions: RequestInit = { signal: options?.signal };
    if (options?.method === 'POST') {
      fetchOptions.method = 'POST';
      fetchOptions.headers = { 'Content-Type': 'application/json' };
      fetchOptions.body = JSON.stringify(options.body);
    }
    const res = await fetch(url, fetchOptions);
    if (!res.ok) {
      throw new ApiError(res.status, `API returned ${res.status}: ${res.statusText}`);
    }
    return (await res.json()) as T;
  } catch (error: any) {
    if (error.name === 'AbortError') throw error;
    console.error(`[espnService] Fetch failed for ${url}:`, error.message);
    throw error;
  }
}

export const espnService = {
  // ==========================================================================
  // 1. UNIFIED INTELLIGENCE ENDPOINTS (Powered by backend handlers)
  // ==========================================================================

  /**
   * Replaces the old raw scoreboard fetch. This hits `sports-handler.js` on the backend,
   * returning data enriched with Kalshi, Polymarket, injuries, and standings.
   */
  getScoreboard: async (sport: string, date?: string, team?: string, options?: SportsServiceOptions) => {
    return fetchApi<any>('/api/intelligence/sports/query', {
      ...options,
      method: 'POST',
      body: { league: sport, date, team, include_odds: true },
    });
  },

  /**
   * Fetches win probability timeline from `win-probability-handler.js`.
   */
  getWinProbability: async (league: string, team: string, options?: SportsServiceOptions) => {
    return fetchApi<any>('/api/intelligence/sports/win-probability', {
      ...options,
      method: 'POST',
      body: { league, team },
    });
  },

  /**
   * Fetches live stats fused with PrizePicks from `player-prop-handler.js`.
   */
  getPlayerProps: async (league: string, team: string, options?: SportsServiceOptions) => {
    return fetchApi<any>('/api/intelligence/sports/player-props', {
      ...options,
      method: 'POST',
      body: { league, team },
    });
  },

  /**
   * Triggers the 2-pass Gemini pipeline in `data-table-agent.js` for standings/records.
   */
  getDataTable: async (query: string, options?: SportsServiceOptions) => {
    return fetchApi<any>('/api/intelligence/sports/data-table', {
      ...options,
      method: 'POST',
      body: { query },
    });
  },

  // ==========================================================================
  // 2. RAW API FALLBACKS (Used for specific deep-dives like get_play_by_play)
  // ==========================================================================

  getEventDetail: async (sport: string, eventId: string, options?: SportsServiceOptions) => {
    if (!eventId) throw new Error('eventId is required');
    return fetchApi<any>(`/api-proxy/espn/${sport}/event/${eventId}`, options);
  },

  getPlayByPlay: async (sport: string, eventId: string, options?: SportsServiceOptions) => {
    if (!eventId) throw new Error('eventId is required');
    return fetchApi<any>(`/api-proxy/espn/${sport}/event/${eventId}/plays`, options);
  },

  getLiveOdds: async (sport: string, options?: SportsServiceOptions) => {
    try {
      return await fetchApi<any>(`/api-proxy/odds/${sport}`, options);
    } catch {
      return null;
    }
  },
};
