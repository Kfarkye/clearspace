// ============================================================================
// Sports Governance Service — Odds Validation & Hallucination Firewall
// Validates all LLM-generated betting data against live source truth
// before it reaches the user. The last gate before artifact emission.
// ============================================================================

const LOG_PREFIX = '[GOVERNANCE]';

// ── Audit Log (append-only, in-memory for now — swap to persistent store at scale) ──

const auditStream = [];
const MAX_AUDIT_ENTRIES = 2000;

function auditLog(eventType, details) {
  auditStream.push({
    timestamp: new Date().toISOString(),
    eventType,
    details,
  });
  // Ring-buffer behavior to prevent memory leak
  if (auditStream.length > MAX_AUDIT_ENTRIES) {
    auditStream.splice(0, auditStream.length - MAX_AUDIT_ENTRIES);
  }
}

// ── Freshness Enforcement ─────────────────────────────────────────────────

const FRESHNESS_THRESHOLDS_MS = {
  live: 15 * 60 * 1000,     // 15 minutes for in-progress games
  pre: 4 * 60 * 60 * 1000,  // 4 hours for pre-game lines
  post: Infinity,            // Historical results don't expire
};

/**
 * Validates that event data isn't stale based on game state.
 * Returns { valid: boolean, reason?: string }
 */
function enforceFreshness(event, fetchTimestamp) {
  if (!event || !fetchTimestamp) return { valid: true };

  const status = (event.status || '').toLowerCase();
  const age = Date.now() - fetchTimestamp;

  let threshold = FRESHNESS_THRESHOLDS_MS.pre;
  if (status.includes('in') || status.includes('progress') || status.includes('live')) {
    threshold = FRESHNESS_THRESHOLDS_MS.live;
  } else if (status.includes('final') || status.includes('post') || status.includes('complete')) {
    threshold = FRESHNESS_THRESHOLDS_MS.post;
  }

  if (age > threshold) {
    auditLog('FRESHNESS_VIOLATION', {
      gameId: event.game_id,
      status,
      ageMs: age,
      thresholdMs: threshold,
    });
    return { valid: false, reason: `Data is ${Math.round(age / 60000)}m old, threshold is ${Math.round(threshold / 60000)}m for ${status} games` };
  }

  return { valid: true };
}

// ── Odds Validation ───────────────────────────────────────────────────────

/**
 * Validates a single odds value is within plausible American odds bounds.
 * American odds: typically -10000 to +10000 for real markets.
 * Rejects obviously hallucinated values like +999999 or -1.
 */
function isPlausibleAmericanOdds(ml) {
  if (ml == null || typeof ml !== 'number' || isNaN(ml)) return false;
  if (ml === 0) return false; // American odds are never exactly 0
  if (ml > 0 && ml < 100) return false; // Positive American odds must be >= +100
  if (ml < 0 && ml > -100) return false; // Negative American odds must be <= -100
  if (Math.abs(ml) > 50000) return false; // Unrealistically extreme
  return true;
}

/**
 * Validates implied probability is within bounds (1-99%).
 */
function isPlausibleImpliedProb(prob) {
  if (prob == null || typeof prob !== 'number' || isNaN(prob)) return false;
  return prob > 0 && prob < 100;
}

/**
 * Cross-validates odds across books for internal consistency.
 * If DraftKings says home is -200 but Kalshi says home implied is 15%, that's a contradiction.
 * American odds of -200 implies ~66.7% probability. 15% is wildly off.
 */
function americanToImpliedPct(ml) {
  if (ml == null) return null;
  if (ml > 0) return 100 / (ml + 100) * 100;
  if (ml < 0) return Math.abs(ml) / (Math.abs(ml) + 100) * 100;
  return null;
}

/**
 * Validates the books array in a single event. Strips invalid entries and logs violations.
 * Returns the cleaned books array.
 */
function validateBooksArray(books, eventContext) {
  if (!Array.isArray(books) || books.length === 0) return books;

  const validated = [];
  for (const book of books) {
    const violations = [];

    // Check homeML plausibility
    if (book.homeML != null && !isPlausibleAmericanOdds(book.homeML)) {
      violations.push(`homeML=${book.homeML} out of bounds`);
    }
    // Check awayML plausibility
    if (book.awayML != null && !isPlausibleAmericanOdds(book.awayML)) {
      violations.push(`awayML=${book.awayML} out of bounds`);
    }
    // Check implied probabilities if present
    if (book.impliedHome != null && !isPlausibleImpliedProb(book.impliedHome)) {
      violations.push(`impliedHome=${book.impliedHome} out of bounds`);
    }
    if (book.impliedAway != null && !isPlausibleImpliedProb(book.impliedAway)) {
      violations.push(`impliedAway=${book.impliedAway} out of bounds`);
    }

    // Cross-consistency: if both ML and implied exist, verify they're within 15pp
    if (book.homeML != null && book.impliedHome != null) {
      const derivedImplied = americanToImpliedPct(book.homeML);
      if (derivedImplied != null) {
        const drift = Math.abs(derivedImplied - book.impliedHome);
        if (drift > 15) {
          violations.push(`homeML→implied drift ${drift.toFixed(1)}pp exceeds 15pp tolerance`);
        }
      }
    }

    if (violations.length > 0) {
      auditLog('ODDS_VALIDATION_FAILURE', {
        provider: book.provider,
        ...eventContext,
        violations,
      });
      console.warn(`${LOG_PREFIX} Stripping ${book.provider} from ${eventContext.gameId}: ${violations.join('; ')}`);
      // Don't include this book — it's suspect
    } else {
      validated.push(book);
    }
  }

  return validated;
}

/**
 * Validates the bestBook selection is internally consistent.
 * If the best book was stripped by validation, recalculate.
 */
function recomputeBestBook(books) {
  if (!Array.isArray(books) || books.length === 0) return undefined;

  function pickBest(side) {
    let best = null;
    for (const b of books) {
      const ml = side === 'home' ? b.homeML : b.awayML;
      if (ml == null) continue;
      const mlNum = typeof ml === 'number' ? ml : parseInt(ml, 10);
      if (isNaN(mlNum)) continue;
      if (!best || mlNum > best.ml) {
        best = { provider: b.provider, ml: mlNum, deepLink: b.deepLink };
      }
    }
    return best;
  }

  const bestHome = pickBest('home');
  const bestAway = pickBest('away');
  return (bestHome || bestAway) ? { home: bestHome, away: bestAway } : undefined;
}

// ── Top-Level Governance Entry Point ──────────────────────────────────────

/**
 * Governs a complete sports artifact before it reaches the user.
 * Validates freshness, odds plausibility, cross-book consistency, and bestBook integrity.
 * 
 * @param {Object} artifact - The full sports artifact from handleSportsQuery
 * @param {number} fetchTimestamp - Date.now() at the time of data fetch
 * @returns {Object} The governed artifact with invalid data stripped
 */
export function governSportsArtifact(artifact, fetchTimestamp) {
  if (!artifact || !artifact.data?.events) {
    auditLog('GOVERNANCE_SKIPPED', { reason: 'No events in artifact', artifactId: artifact?.id });
    return artifact;
  }

  const governedEvents = [];
  let totalViolations = 0;

  for (const event of artifact.data.events) {
    // 1. Freshness check
    const freshnessResult = enforceFreshness(event, fetchTimestamp);
    if (!freshnessResult.valid) {
      totalViolations++;
      // Mark as stale but don't strip — scores are still useful, just odds are suspect
      event._stale = true;
      event._staleReason = freshnessResult.reason;
    }

    // 2. Validate books array
    if (event.books && event.books.length > 0) {
      const originalCount = event.books.length;
      event.books = validateBooksArray(event.books, {
        gameId: event.game_id,
        homeTeam: event.home_team?.abbreviation,
        awayTeam: event.away_team?.abbreviation,
      });
      if (event.books.length < originalCount) {
        totalViolations += (originalCount - event.books.length);
      }

      // 3. Recompute bestBook if books were stripped
      if (event.books.length !== originalCount) {
        event.bestBook = recomputeBestBook(event.books);
      }

      // Clean up empty arrays
      if (event.books.length === 0) {
        event.books = undefined;
        event.bestBook = undefined;
      }
    }

    // 4. Validate embedded odds object
    if (event.odds) {
      if (event.odds.homeMoneyline != null && !isPlausibleAmericanOdds(event.odds.homeMoneyline)) {
        auditLog('EMBEDDED_ODDS_VIOLATION', { gameId: event.game_id, field: 'homeMoneyline', value: event.odds.homeMoneyline });
        event.odds.homeMoneyline = null;
        totalViolations++;
      }
      if (event.odds.awayMoneyline != null && !isPlausibleAmericanOdds(event.odds.awayMoneyline)) {
        auditLog('EMBEDDED_ODDS_VIOLATION', { gameId: event.game_id, field: 'awayMoneyline', value: event.odds.awayMoneyline });
        event.odds.awayMoneyline = null;
        totalViolations++;
      }
    }

    governedEvents.push(event);
  }

  auditLog('GOVERNANCE_APPLIED', {
    artifactId: artifact.id,
    eventsProcessed: governedEvents.length,
    totalViolations,
    timestamp: fetchTimestamp,
  });

  if (totalViolations > 0) {
    console.log(`${LOG_PREFIX} Governed ${governedEvents.length} events, found ${totalViolations} violation(s)`);
  }

  return {
    ...artifact,
    data: {
      ...artifact.data,
      events: governedEvents,
    },
    _governance: {
      applied: true,
      violations: totalViolations,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Returns the current audit log for inspection (admin/debug endpoint).
 */
export function getGovernanceAuditLog() {
  return [...auditStream];
}

/**
 * Exports for testing and barrel.
 */
export {
  enforceFreshness,
  validateBooksArray,
  isPlausibleAmericanOdds,
  isPlausibleImpliedProb,
  americanToImpliedPct,
  recomputeBestBook,
  auditLog,
};
