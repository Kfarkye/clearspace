// ============================================================================
// TRUTH Error Taxonomy — Standardized Machine-Readable Error Codes
//
// Ported from TRUTH V1.1 Python pipeline for the Node.js backend.
// Every error in the system maps to one of these codes for:
//   - Structured logging (JSON log filters in Cloud Logging)
//   - DLQ routing (error_code attribute on dead letters)
//   - Alerting (SEV policies keyed on error_code)
//   - Client diagnostics (machine-parseable error responses)
// ============================================================================

/**
 * @enum {string}
 * Canonical error codes for the TRUTH data substrate.
 * Each code maps to a specific failure domain for operational triage.
 */
export const SubstrateErrorCode = Object.freeze({
  // ── Ingest & Schema ──────────────────────────────────────────────────────
  /** Pub/Sub envelope or HTTP request body failed structural validation */
  ENVELOPE_SCHEMA_FAULT: 'ENVELOPE_SCHEMA_FAULT',
  /** Decoded payload failed domain model validation (missing fields, wrong types) */
  PAYLOAD_SCHEMA_FAULT: 'PAYLOAD_SCHEMA_FAULT',
  /** Domain strategy transformation threw during canonicalization */
  TRANSFORM_FAULT: 'TRANSFORM_FAULT',
  /** No registered strategy for the given source_id */
  UNKNOWN_SOURCE_FAULT: 'UNKNOWN_SOURCE_FAULT',

  // ── Infrastructure ────────────────────────────────────────────────────────
  /** GCS archive write failed (timeout, permission, quota) */
  STORAGE_TIER_FAULT: 'STORAGE_TIER_FAULT',
  /** Pub/Sub publish failed (downstream topic unreachable) */
  MESSAGE_BUS_FAULT: 'MESSAGE_BUS_FAULT',
  /** Spanner transaction failed (deadline, contention, unavailable) */
  ACID_SYNC_FAULT: 'ACID_SYNC_FAULT',

  // ── Auth & Access ─────────────────────────────────────────────────────────
  /** OIDC token invalid, expired, or wrong service account */
  UNAUTHORIZED_IDENTITY: 'UNAUTHORIZED_IDENTITY',

  // ── ESPN / Sports Data ────────────────────────────────────────────────────
  /** ESPN Site API returned non-200 or timed out */
  ESPN_SITE_FETCH_FAULT: 'ESPN_SITE_FETCH_FAULT',
  /** ESPN Core API returned non-200 or timed out */
  ESPN_CORE_FETCH_FAULT: 'ESPN_CORE_FETCH_FAULT',
  /** Odds provider returned malformed or empty data */
  ODDS_PROVIDER_FAULT: 'ODDS_PROVIDER_FAULT',
  /** Entity resolution failed (team name → canonical ID mismatch) */
  ENTITY_RESOLUTION_FAULT: 'ENTITY_RESOLUTION_FAULT',

  // ── Chat / LLM ────────────────────────────────────────────────────────────
  /** Vertex AI / Gemini API call failed */
  LLM_INFERENCE_FAULT: 'LLM_INFERENCE_FAULT',
  /** Tool call returned invalid or unparseable result */
  TOOL_EXECUTION_FAULT: 'TOOL_EXECUTION_FAULT',
  /** Chat session history was null or malformed */
  CHAT_HISTORY_FAULT: 'CHAT_HISTORY_FAULT',
});

/**
 * Severity levels for structured logging.
 * Maps to Cloud Logging severity for dashboard filtering.
 */
export const Severity = Object.freeze({
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
});

/**
 * Creates a structured error log entry compatible with Cloud Logging.
 *
 * @param {string} errorCode - A SubstrateErrorCode value
 * @param {string} message - Human-readable error description
 * @param {Object} [context={}] - Additional context (userId, endpoint, etc.)
 * @param {string} [severity='ERROR'] - Severity level
 * @returns {{ severity: string, error_code: string, message: string, context: Object, timestamp: string }}
 */
export function structuredError(errorCode, message, context = {}, severity = Severity.ERROR) {
  const entry = {
    severity,
    error_code: errorCode,
    message,
    context,
    timestamp: new Date().toISOString(),
  };

  // Log to stdout in Cloud Logging JSON format
  if (severity === Severity.CRITICAL || severity === Severity.ERROR) {
    console.error(JSON.stringify(entry));
  } else if (severity === Severity.WARNING) {
    console.warn(JSON.stringify(entry));
  }

  return entry;
}

/**
 * Determines if a GCP/Spanner error is transient (retryable).
 * Mirrors the Python `is_transient_gcp_error` logic.
 *
 * @param {Error} err
 * @returns {boolean}
 */
export function isTransientGcpError(err) {
  const code = err.code || err.status;
  // gRPC codes: 4=DEADLINE_EXCEEDED, 8=RESOURCE_EXHAUSTED, 13=INTERNAL, 14=UNAVAILABLE
  const transientCodes = [4, 8, 13, 14, 429, 503, 500];
  if (transientCodes.includes(code)) return true;
  // PreconditionFailed is NOT transient — it means a write conflict
  if (code === 9 || code === 412) return false;
  // Check message patterns
  const msg = (err.message || '').toLowerCase();
  return msg.includes('deadline exceeded') ||
         msg.includes('unavailable') ||
         msg.includes('too many requests') ||
         msg.includes('internal server error');
}
