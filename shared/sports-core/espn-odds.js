// ============================================================================
// Shared Sports Core: ESPN Odds Enrichment
// Resolves Core API odds (moneyline, spread, O/U) for any sport
// Extracted and unified from clearspace/backend/server.js + AURA normalizers
// ============================================================================

import { ESPN_SPORT_MAP } from './entity-resolution.js';

// Bounded LRU Cache to prevent OOM crashes
class BoundedCache extends Map {
    constructor(maxSize = 300) {
        super();
        this.maxSize = maxSize;
    }
    set(key, value) {
        if (this.size >= this.maxSize && !this.has(key)) {
            this.delete(this.keys().next().value); // Evict oldest
        }
        return super.set(key, value);
    }
}

const oddsCache = new BoundedCache(500);
const CACHE_TTL_MS = {
    live: 2500,      // Live games: 2.5s
    pre: 60_000,     // Pre-game: 60s
    final: Infinity   // Final: never expires
};

/**
 * Resolve a Core API $ref URL with timeout
 * @param {string} refUrl
 * @param {number} [timeoutMs=3000]
 * @returns {Promise<any|null>}
 */
export async function resolveRef(refUrl, timeoutMs = 3000) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(refUrl, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

/**
 * Fetches and parses ESPN Core API odds for a specific event/competition.
 * Returns a normalized odds object with moneyline, spread, and O/U.
 *
 * @param {Object} params
 * @param {string} params.sport - Sport key (e.g., 'mlb', 'nba')
 * @param {string} params.eventId - ESPN event ID
 * @param {string} params.competitionId - ESPN competition ID (usually same as eventId)
 * @param {boolean} [params.isLive=false] - Whether the game is currently live
 * @returns {Promise<{provider: string, spread: string, overUnder: number|null, homeMoneyline: number|null, awayMoneyline: number|null, source: string}|null>}
 */
export async function fetchCoreApiOdds({ sport, eventId, competitionId, isLive = false }) {
    const mapping = ESPN_SPORT_MAP[sport?.toLowerCase()];
    if (!mapping) return null;

    const compId = competitionId || eventId;
    const cacheKey = `odds:${eventId}:${compId}`;
    const now = Date.now();

    // Check cache
    const cached = oddsCache.get(cacheKey);
    if (cached) {
        const status = isLive ? 'live' : (cached.isFinal ? 'final' : 'pre');
        const ttl = CACHE_TTL_MS[status];
        if (now - cached.timestamp < ttl) {
            return cached.data;
        }
    }

    const oddsUrl = `https://sports.core.api.espn.com/v2/sports/${mapping.core}/leagues/${mapping.league}/events/${eventId}/competitions/${compId}/odds?_=${now}`;

    try {
        const oddsContainer = await resolveRef(oddsUrl, 4000);
        if (!oddsContainer?.items?.length) {
            oddsCache.set(cacheKey, { data: null, timestamp: now, isFinal: false });
            return null;
        }

        // Resolve individual odds provider refs
        const oddsItems = await Promise.all(
            oddsContainer.items.slice(0, 5).map(item =>
                item.$ref ? resolveRef(item.$ref, 3000) : Promise.resolve(item)
            )
        );
        const providers = oddsItems.filter(Boolean);

        // Find best provider: DraftKings Live > DraftKings > ESPN BET > first available
        let provider = null;
        if (isLive) {
            provider = providers.find(p => p.provider?.name?.includes('Live Odds') && p.provider?.name?.includes('DraftKings'));
        }
        if (!provider) provider = providers.find(p => p.provider?.name?.includes('DraftKings') || p.provider?.id === '38' || p.provider?.id === '100');
        if (!provider) provider = providers.find(p => p.provider?.name?.includes('ESPN BET') || p.provider?.id === '36');
        if (!provider) provider = providers[0];

        if (!provider) {
            oddsCache.set(cacheKey, { data: null, timestamp: now, isFinal: false });
            return null;
        }

        const oddsNode = isLive ? 'current' : 'open';
        const homeSource = provider.homeTeamOdds?.[oddsNode] || provider.homeTeamOdds || {};
        const awaySource = provider.awayTeamOdds?.[oddsNode] || provider.awayTeamOdds || {};

        // Parse moneyline from multiple possible paths
        const homeML = homeSource.moneyLine?.american
            ? parseInt(homeSource.moneyLine.american, 10)
            : (provider.homeTeamOdds?.moneyLine || null);
        const awayML = awaySource.moneyLine?.american
            ? parseInt(awaySource.moneyLine.american, 10)
            : (provider.awayTeamOdds?.moneyLine || null);

        // Parse spread
        let spreadStr = '';
        if (provider.spread != null && provider.spread !== 0) {
            const spreadNum = parseFloat(provider.spread);
            spreadStr = isNaN(spreadNum) ? '' : `${spreadNum > 0 ? '+' : '-'}${Math.abs(spreadNum)}`;
        } else if (!isLive && provider.details) {
            spreadStr = provider.details;
        }

        // Parse O/U
        const totalSource = provider[oddsNode] || provider;
        const overUnder = totalSource?.total?.alternateDisplayValue
            ? parseFloat(totalSource.total.alternateDisplayValue)
            : (provider.overUnder || null);

        const result = {
            provider: provider.provider?.name || 'DraftKings',
            spread: spreadStr,
            overUnder,
            homeMoneyline: homeML,
            awayMoneyline: awayML,
            source: isLive ? 'live_core' : 'core',
        };

        oddsCache.set(cacheKey, { data: result, timestamp: now, isFinal: false });
        return result;

    } catch (e) {
        console.warn(`[ESPN Odds] Core odds resolution failed for event ${eventId}:`, e.message);
        oddsCache.set(cacheKey, { data: null, timestamp: now, isFinal: false });
        return null;
    }
}

/**
 * Convert implied probability (0-1) to American odds string
 * @param {number} impliedProb - Probability between 0 and 1
 * @returns {string} American odds (e.g., "-150" or "+200")
 */
export function toAmericanOdds(impliedProb) {
    if (impliedProb <= 0) return '+10000';
    if (impliedProb >= 1) return '-10000';
    const p = impliedProb * 100;
    if (p > 50) {
        return '-' + Math.round((p / (100 - p)) * 100);
    } else {
        return '+' + Math.round(((100 - p) / p) * 100);
    }
}

export { BoundedCache };
