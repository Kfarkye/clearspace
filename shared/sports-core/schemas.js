// ============================================================================
// TRUTH Canonical Schemas — Domain Object Contracts
//
// Ported from TRUTH V1.1 Python pipeline (Pydantic models → JS validators).
// These define the canonical data shapes that flow through the system:
//   - SourceReceipt: provenance chain for every data point
//   - CanonicalObject: the universal entity envelope for Spanner writes
//   - Edge: typed relationships between entities (graph model)
//
// Usage:
//   import { validateCanonicalObject, createSourceReceipt } from '@clearspace/sports-core/schemas.js';
//   const receipt = createSourceReceipt({ sourceName: 'espn_site', ... });
//   const obj = validateCanonicalObject({ entityId: 'truth_match_401234', ... });
// ============================================================================

/**
 * Creates a validated SourceReceipt — provenance metadata for a data point.
 * Every canonical object must carry at least one receipt proving where the data came from.
 *
 * @param {Object} params
 * @param {string} params.sourceName - Provider identifier (e.g. 'espn_site', 'the_odds_api')
 * @param {string} params.sourceUrl - The API URL that was called
 * @param {string} [params.fetchedAt] - ISO timestamp of when the data was fetched
 * @param {string} [params.sourceStatus='SUCCESS'] - 'SUCCESS' | 'PARTIAL' | 'ERROR'
 * @param {string} [params.rawRef] - GCS URI or cache key for the raw payload
 * @param {number} [params.confidence=0.99] - Confidence score 0.0-1.0
 * @returns {Object} Validated SourceReceipt
 * @throws {Error} If required fields are missing
 */
export function createSourceReceipt({
  sourceName,
  sourceUrl,
  fetchedAt = new Date().toISOString(),
  sourceStatus = 'SUCCESS',
  rawRef = '',
  confidence = 0.99,
}) {
  if (!sourceName) throw new Error('SourceReceipt: sourceName is required');
  if (!sourceUrl) throw new Error('SourceReceipt: sourceUrl is required');
  if (confidence < 0 || confidence > 1) throw new Error('SourceReceipt: confidence must be 0.0-1.0');

  return Object.freeze({
    source_name: sourceName,
    source_url: sourceUrl,
    fetched_at: fetchedAt,
    source_status: sourceStatus,
    raw_ref: rawRef,
    confidence,
  });
}

/**
 * Validates and creates a CanonicalObject — the universal entity envelope.
 * This is the shape that gets written to the Spanner Entities table.
 *
 * @param {Object} params
 * @param {string} params.entityId - Globally unique entity ID (e.g. 'truth_match_401234')
 * @param {string} params.entityType - Domain type ('Match', 'Team', 'Player', 'Odds', 'Prop')
 * @param {Object} params.attributes - Freeform attributes dict (scores, status, etc.)
 * @param {Array} [params.edges=[]] - Typed relationships to other entities
 * @param {Array} params.receipts - At least one SourceReceipt
 * @returns {Object} Validated CanonicalObject
 * @throws {Error} If required fields are missing or receipts is empty
 */
export function validateCanonicalObject({
  entityId,
  entityType,
  attributes,
  edges = [],
  receipts,
}) {
  if (!entityId) throw new Error('CanonicalObject: entityId is required');
  if (!entityType) throw new Error('CanonicalObject: entityType is required');
  if (!attributes || typeof attributes !== 'object') throw new Error('CanonicalObject: attributes must be an object');
  if (!Array.isArray(receipts) || receipts.length === 0) throw new Error('CanonicalObject: at least one receipt is required');

  // Validate entity type is a known domain type
  const VALID_ENTITY_TYPES = ['Match', 'Team', 'Player', 'Odds', 'Prop', 'Injury', 'Standings', 'Schedule'];
  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    throw new Error(`CanonicalObject: entityType '${entityType}' not in ${VALID_ENTITY_TYPES.join(', ')}`);
  }

  // Validate edges
  for (const edge of edges) {
    if (!edge.relation_type) throw new Error('Edge: relation_type is required');
    if (!edge.target_entity_id) throw new Error('Edge: target_entity_id is required');
  }

  return Object.freeze({
    entity_id: entityId,
    entity_type: entityType,
    attributes: Object.freeze({ ...attributes }),
    edges: Object.freeze(edges.map(e => Object.freeze({ ...e }))),
    receipts: Object.freeze(receipts.map(r => Object.freeze({ ...r }))),
  });
}

/**
 * Constants for entity ID prefixes — ensures consistency across the system.
 */
export const EntityPrefix = Object.freeze({
  MATCH: 'truth_match_',
  TEAM: 'truth_team_',
  PLAYER: 'truth_player_',
  ODDS: 'truth_odds_',
  PROP: 'truth_prop_',
});

/**
 * Strategy interface contract for domain transformers.
 * Any new data source must implement this shape.
 *
 * @typedef {Object} DomainStrategy
 * @property {string} sourceId - Unique source identifier (e.g. 'espn_site_mlb')
 * @property {function} canonicalize - (rawPayload, sourceUrl) → CanonicalObject
 */

/**
 * ESPN Site API → CanonicalObject transformer.
 * Converts the enriched ESPN proxy response into canonical match entities.
 *
 * @param {Object} event - Single event from the ESPN proxy response
 * @param {string} sport - Sport key (e.g. 'mlb', 'nfl')
 * @param {string} sourceUrl - The ESPN API URL that was called
 * @returns {Object} CanonicalObject
 */
export function canonicalizeEspnEvent(event, sport, sourceUrl) {
  const receipt = createSourceReceipt({
    sourceName: `espn_site_${sport}`,
    sourceUrl,
    sourceStatus: 'SUCCESS',
    confidence: 0.95,
  });

  const away = (event.teams || []).find(t => t.homeAway === 'away') || {};
  const home = (event.teams || []).find(t => t.homeAway === 'home') || {};

  return validateCanonicalObject({
    entityId: `${EntityPrefix.MATCH}${event.id}`,
    entityType: 'Match',
    attributes: {
      sport,
      status: event.status,
      detail: event.detail,
      period: event.period,
      clock: event.clock,
      date: event.date,
      venue: event.venue,
      broadcast: event.broadcast,
      away_team: { name: away.name, abbr: away.abbreviation, score: away.score, record: away.record },
      home_team: { name: home.name, abbr: home.abbreviation, score: home.score, record: home.record },
      odds: event.odds || null,
      predictor: event.predictor || null,
    },
    edges: [
      { relation_type: 'AWAY_TEAM', target_entity_id: `${EntityPrefix.TEAM}${away.abbreviation || 'TBD'}` },
      { relation_type: 'HOME_TEAM', target_entity_id: `${EntityPrefix.TEAM}${home.abbreviation || 'TBD'}` },
    ],
    receipts: [receipt],
  });
}
