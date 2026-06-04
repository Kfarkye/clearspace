// ============================================================================
// Shared Sports Core: Firestore Circuit Breaker
// Prevents cascading failures when Firestore quotas are exhausted
// Extracted from AURA (untitled_v4_source/src/server/db-breaker.ts)
// ============================================================================

let dbDisabledUntil = 0;
let dbDisabledReason = null;

/**
 * Returns the current database disabled reason if active, otherwise null.
 * @returns {string|null}
 */
export function getDbDisabledReason() {
    if (Date.now() < dbDisabledUntil) {
        return dbDisabledReason;
    }
    return null;
}

/**
 * Checks if the database is currently disabled due to circuit breaker cooldown.
 * @returns {boolean}
 */
export function isDbDisabled() {
    return Date.now() < dbDisabledUntil;
}

/**
 * Reports a Firestore error to the circuit breaker.
 * If the error represents a quota limit exceeded/exhaustion, it trips the breaker.
 * @param {Error|any} err - The error from Firestore
 * @param {string} [context='General'] - Where the error occurred
 */
export function reportDbError(err, context = 'General') {
    const errMsg = err?.message || String(err);
    const errCode = err?.code || '';
    const isQuotaExceeded = errCode === 'resource-exhausted' ||
                            errMsg.includes('Quota exceeded') ||
                            errMsg.includes('quota metric') ||
                            errMsg.includes('Quota limit exceeded');

    if (isQuotaExceeded) {
        // Break circuit for 15 minutes to avoid hitting depleted collections
        dbDisabledUntil = Date.now() + 15 * 60 * 1000;
        dbDisabledReason = `Quota exceeded fallback active (${context})`;
        console.warn(`[CIRCUIT BREAKER] Tripped at [${context}] due to Firestore quota exhaustion. Backing off database queries for 15 minutes. Error details: ${errMsg}`);
    } else {
        // Less critical database errors trigger a brief 10 second delay
        dbDisabledUntil = Date.now() + 10 * 1000;
        dbDisabledReason = `Transient failure (${context})`;
        console.warn(`[CIRCUIT BREAKER] Short cooldown at [${context}] due to transient DB error: ${errMsg}`);
    }
}

/**
 * Resets the circuit breaker state (useful if billing was enabled or databases reset).
 */
export function resetBreaker() {
    dbDisabledUntil = 0;
    dbDisabledReason = null;
    console.log('[CIRCUIT BREAKER] Reset successfully.');
}
