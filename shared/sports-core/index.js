// @clearspace/sports-core — Barrel Export
// Single import point for all shared sports infrastructure

export {
    resolveTeamAbbreviation,
    ESPN_SPORT_MAP,
    TEAM_NAME_RESOLUTION_MAP,
    COLLISION_RESOLUTION_MAP,
    SORTED_RESOLUTION_KEYS
} from './entity-resolution.js';

export {
    isDbDisabled,
    getDbDisabledReason,
    reportDbError,
    resetBreaker
} from './db-breaker.js';

export {
    fetchCoreApiOdds,
    resolveRef,
    toAmericanOdds,
    BoundedCache
} from './espn-odds.js';


export {
    governSportsArtifact,
    getGovernanceAuditLog,
    enforceFreshness,
    validateBooksArray,
    isPlausibleAmericanOdds,
    recomputeBestBook,
    auditLog as governanceAuditLog,
} from './sports-governance.js';

export {
    createSourceReceipt,
    validateCanonicalObject,
    canonicalizeEspnEvent,
    EntityPrefix,
} from './schemas.js';
