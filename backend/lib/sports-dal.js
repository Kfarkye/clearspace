// ============================================================================
// Unified Sports Data Access Layer
//
// Connects to the `sports-db` (or env-configured database) on the
// `aura-governance-instance` Spanner instance.
//
// Schema uses composite primary keys: (league_id, ...)
// All queries filter by league_id to perform highly efficient single-partition scans.
// ============================================================================

import { Spanner } from '@google-cloud/spanner';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SPANNER_INSTANCE = process.env.WC_SPANNER_INSTANCE || 'aura-governance-instance';
const SPANNER_DATABASE = process.env.WC_SPANNER_DATABASE || 'sports-db';
const SPANNER_PROJECT  = process.env.GOOGLE_CLOUD_PROJECT;

// ---------------------------------------------------------------------------
// Singleton Client
// ---------------------------------------------------------------------------

let dbInstance = null;

export function getDatabase() {
  if (!dbInstance) {
    const client = new Spanner({ projectId: SPANNER_PROJECT });
    const instance = client.instance(SPANNER_INSTANCE);
    dbInstance = instance.database(SPANNER_DATABASE);
    console.log(`[Sports-Spanner] Connected to ${SPANNER_PROJECT}/${SPANNER_INSTANCE}/${SPANNER_DATABASE}`);
  }
  return dbInstance;
}

// ---------------------------------------------------------------------------
// Leagues
// ---------------------------------------------------------------------------

/**
 * Returns all registered leagues.
 * @returns {Promise<Array>}
 */
export async function getLeagues() {
  const db = getDatabase();
  const sql = `SELECT league_id, sport_type, display_name, current_season, created_at
               FROM leagues ORDER BY league_id`;
  const [rows] = await db.run({ sql });
  return rows.map(r => {
    const row = r.toJSON();
    return {
      leagueId: row.league_id,
      sportType: row.sport_type,
      displayName: row.display_name,
      currentSeason: row.current_season,
      createdAt: row.created_at,
    };
  });
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

/**
 * Returns all teams for a given league, optionally filtered by group.
 * @param {string} leagueId
 * @param {string} [group] - Group letter filter (A-L)
 * @param {boolean} [includePlaceholders=false] - Whether to include knockout stage placeholders
 * @returns {Promise<Array>}
 */
export async function getTeams(leagueId, group, includePlaceholders = false) {
  const db = getDatabase();
  let sql = `SELECT team_code, name, group_letter, fifa_ranking, confederation, flag_emoji, is_placeholder, provenance
             FROM teams WHERE league_id = @leagueId`;
  const params = { leagueId };
  if (group) {
    sql += ` AND group_letter = @group`;
    params.group = group;
  }
  if (!includePlaceholders) {
    sql += ` AND COALESCE(is_placeholder, false) = false`;
  }
  sql += ` ORDER BY group_letter, fifa_ranking`;

  const [rows] = await db.run({ sql, params });
  return rows.map(r => {
    const row = r.toJSON();
    return {
      teamCode: row.team_code,
      name: row.name,
      group: row.group_letter,
      fifaRanking: row.fifa_ranking,
      confederation: row.confederation,
      flagEmoji: row.flag_emoji,
      isPlaceholder: row.is_placeholder,
      provenance: row.provenance || null,
    };
  });
}

/**
 * Returns a single team by code.
 * @param {string} leagueId
 * @param {string} teamCode
 * @returns {Promise<Object|null>}
 */
export async function getTeam(leagueId, teamCode) {
  const db = getDatabase();
  const [rows] = await db.run({
    sql: `SELECT team_code, name, group_letter, fifa_ranking, confederation, flag_emoji, is_placeholder, provenance
          FROM teams WHERE league_id = @leagueId AND (team_code = @teamCode OR LOWER(name) = LOWER(@teamCode))`,
    params: { leagueId, teamCode },
  });
  if (rows.length === 0) return null;
  const row = rows[0].toJSON();
  return {
    teamCode: row.team_code,
    name: row.name,
    group: row.group_letter,
    fifaRanking: row.fifa_ranking,
    confederation: row.confederation,
    flagEmoji: row.flag_emoji,
    isPlaceholder: row.is_placeholder,
    provenance: row.provenance || null,
  };
}

// ---------------------------------------------------------------------------
// Venues
// ---------------------------------------------------------------------------

/**
 * Returns all venues.
 * @returns {Promise<Array>}
 */
export async function getVenues() {
  const db = getDatabase();
  const [rows] = await db.run({
    sql: `SELECT venue_id, name, city, state, country, capacity, latitude, longitude, timezone, provenance
          FROM venues ORDER BY name`,
  });
  return rows.map(r => {
    const row = r.toJSON();
    return {
      venueId: row.venue_id,
      name: row.name,
      city: row.city,
      state: row.state,
      country: row.country,
      capacity: row.capacity,
      lat: row.latitude,
      lng: row.longitude,
      timezone: row.timezone,
      provenance: row.provenance || null,
    };
  });
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

/**
 * Returns all matches for a league, enriched with team names and venue info.
 * Optionally filtered by group, stage, or team.
 *
 * @param {string} leagueId
 * @param {{ group?: string, stage?: string, team?: string }} filters
 * @returns {Promise<Array>}
 */
export async function getMatches(leagueId, filters = {}) {
  const db = getDatabase();
  let sql = `
    SELECT m.match_id, m.group_letter, m.match_number, m.kickoff, m.stage, m.status,
           m.home_score, m.away_score, m.provenance,
           m.home_team_code, ht.name AS home_team_name, ht.flag_emoji AS home_flag,
           m.away_team_code, awt.name AS away_team_name, awt.flag_emoji AS away_flag,
           v.name AS venue_name, v.city AS venue_city
    FROM matches m
    LEFT JOIN teams ht ON m.league_id = ht.league_id AND m.home_team_code = ht.team_code
    LEFT JOIN teams awt ON m.league_id = awt.league_id AND m.away_team_code = awt.team_code
    LEFT JOIN venues v ON m.venue_id = v.venue_id
    WHERE m.league_id = @leagueId`;

  const params = { leagueId };
  if (filters.group) {
    sql += ` AND m.group_letter = @group`;
    params.group = filters.group;
  }
  if (filters.stage) {
    sql += ` AND m.stage = @stage`;
    params.stage = filters.stage;
  }
  if (filters.team) {
    sql += ` AND (m.home_team_code = @team OR m.away_team_code = @team)`;
    params.team = filters.team.toUpperCase();
  }
  sql += ` ORDER BY m.kickoff ASC`;

  const [rows] = await db.run({ sql, params });
  return rows.map(r => {
    const row = r.toJSON();
    return {
      matchId: row.match_id,
      group: row.group_letter,
      matchNumber: row.match_number,
      kickoff: row.kickoff,
      stage: row.stage,
      status: row.status || 'scheduled',
      homeTeam: {
        code: row.home_team_code,
        name: row.home_team_name,
        flag: row.home_flag,
        score: row.home_score,
      },
      awayTeam: {
        code: row.away_team_code,
        name: row.away_team_name,
        flag: row.away_flag,
        score: row.away_score,
      },
      venue: {
        name: row.venue_name,
        city: row.venue_city,
      },
      provenance: row.provenance || null,
    };
  });
}

/**
 * Returns a single match with full detail including odds, edges, and predictions.
 * @param {string} leagueId
 * @param {string} matchId
 * @returns {Promise<Object|null>}
 */
export async function getMatchDetail(leagueId, matchId) {
  const db = getDatabase();

  // Match + teams + venue
  const [matchRows] = await db.run({
    sql: `
      SELECT m.*, 
             ht.name AS home_team_name, ht.flag_emoji AS home_flag, ht.fifa_ranking AS home_rank, ht.provenance AS home_provenance,
             awt.name AS away_team_name, awt.flag_emoji AS away_flag, awt.fifa_ranking AS away_rank, awt.provenance AS away_provenance,
             v.name AS venue_name, v.city AS venue_city, v.state AS venue_state, v.capacity, v.provenance AS venue_provenance
      FROM matches m
      LEFT JOIN teams ht ON m.league_id = ht.league_id AND m.home_team_code = ht.team_code
      LEFT JOIN teams awt ON m.league_id = awt.league_id AND m.away_team_code = awt.team_code
      LEFT JOIN venues v ON m.venue_id = v.venue_id
      WHERE m.league_id = @leagueId AND m.match_id = @matchId`,
    params: { leagueId, matchId },
  });

  if (matchRows.length === 0) return null;
  const m = matchRows[0].toJSON();

  // Interleaved odds
  const [oddsRows] = await db.run({
    sql: `SELECT odds_id, market_type, team_code, source, american_odds, implied_probability, fetched_at
          FROM odds WHERE league_id = @leagueId AND match_id = @matchId ORDER BY fetched_at DESC`,
    params: { leagueId, matchId },
  });

  // Interleaved edges
  const [edgeRows] = await db.run({
    sql: `SELECT edge_id, team_code, market_type, sportsbook_implied, prediction_implied,
                 edge_pct, sportsbook_source, prediction_source, direction, calculated_at
          FROM edges WHERE league_id = @leagueId AND match_id = @matchId ORDER BY calculated_at DESC`,
    params: { leagueId, matchId },
  });

  // Interleaved prediction prices
  const [predRows] = await db.run({
    sql: `SELECT price_id, market_type, team_code, source, price_cents, implied_probability,
                 volume_usd, fetched_at
          FROM prediction_prices WHERE league_id = @leagueId AND match_id = @matchId ORDER BY fetched_at DESC`,
    params: { leagueId, matchId },
  });

  return {
    matchId: m.match_id,
    group: m.group_letter,
    kickoff: m.kickoff,
    stage: m.stage,
    status: m.status || 'scheduled',
    homeTeam: {
      code: m.home_team_code,
      name: m.home_team_name,
      flag: m.home_flag,
      rank: m.home_rank,
      score: m.home_score,
      provenance: m.home_provenance || null,
    },
    awayTeam: {
      code: m.away_team_code,
      name: m.away_team_name,
      flag: m.away_flag,
      rank: m.away_rank,
      score: m.away_score,
      provenance: m.away_provenance || null,
    },
    venue: {
      name: m.venue_name,
      city: m.venue_city,
      state: m.venue_state,
      capacity: m.capacity,
      provenance: m.venue_provenance || null,
    },
    provenance: m.provenance || null,
    odds: oddsRows.map(r => {
      const o = r.toJSON();
      return {
        oddsId: o.odds_id,
        marketType: o.market_type,
        teamCode: o.team_code,
        source: o.source,
        americanOdds: o.american_odds,
        impliedProbability: o.implied_probability,
        fetchedAt: o.fetched_at,
      };
    }),
    edges: edgeRows.map(r => {
      const e = r.toJSON();
      return {
        edgeId: e.edge_id,
        teamCode: e.team_code,
        marketType: e.market_type,
        sportsbookImplied: e.sportsbook_implied,
        predictionImplied: e.prediction_implied,
        edgePct: e.edge_pct,
        sportsbookSource: e.sportsbook_source,
        predictionSource: e.prediction_source,
        direction: e.direction,
        calculatedAt: e.calculated_at,
      };
    }),
    predictions: predRows.map(r => {
      const p = r.toJSON();
      return {
        priceId: p.price_id,
        marketType: p.market_type,
        teamCode: p.team_code,
        source: p.source,
        priceCents: p.price_cents,
        impliedProbability: p.implied_probability,
        volumeUsd: p.volume_usd,
        fetchedAt: p.fetched_at,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Odds & Edges (cross-match queries)
// ---------------------------------------------------------------------------

/**
 * Returns all odds across all matches, with optional filters and limits.
 * @param {string} leagueId
 * @param {{ matchId?: string, marketType?: string, limit?: number }} [filters]
 * @returns {Promise<Array>}
 */
export async function getOdds(leagueId, filters = {}) {
  const db = getDatabase();
  let sql = `SELECT o.*, m.home_team_code, m.away_team_code, m.kickoff
             FROM odds o
             JOIN matches m ON o.league_id = m.league_id AND o.match_id = m.match_id
             WHERE o.league_id = @leagueId`;
  const params = { leagueId };

  if (filters.matchId) {
    sql += ` AND o.match_id = @matchId`;
    params.matchId = filters.matchId;
  }
  if (filters.marketType) {
    sql += ` AND o.market_type = @marketType`;
    params.marketType = filters.marketType;
  }

  sql += ` ORDER BY o.fetched_at DESC`;

  const limit = typeof filters.limit === 'number' ? filters.limit : 100;
  sql += ` LIMIT @limit`;
  params.limit = limit;

  const [rows] = await db.run({ sql, params });
  return rows.map(r => r.toJSON());
}

/**
 * Returns all odds across all matches for a given team.
 * @param {string} leagueId
 * @param {string} teamCode
 * @returns {Promise<Array>}
 */
export async function getOddsForTeam(leagueId, teamCode) {
  const db = getDatabase();
  const [rows] = await db.run({
    sql: `SELECT o.*, m.home_team_code, m.away_team_code, m.kickoff
          FROM odds o
          JOIN matches m ON o.league_id = m.league_id AND o.match_id = m.match_id
          WHERE o.league_id = @leagueId AND o.team_code = @teamCode
          ORDER BY m.kickoff, o.fetched_at DESC`,
    params: { leagueId, teamCode: teamCode.toUpperCase() },
  });
  return rows.map(r => r.toJSON());
}

/**
 * Returns all betting edges, optionally filtered by team or minimum edge %.
 * @param {string} leagueId
 * @param {{ team?: string, minEdge?: number }} filters
 * @returns {Promise<Array>}
 */
export async function getEdges(leagueId, filters = {}) {
  const db = getDatabase();
  let sql = `
    SELECT e.*, m.home_team_code, m.away_team_code, m.kickoff,
           ht.name AS home_name, awt.name AS away_name
    FROM edges e
    JOIN matches m ON e.league_id = m.league_id AND e.match_id = m.match_id
    LEFT JOIN teams ht ON m.league_id = ht.league_id AND m.home_team_code = ht.team_code
    LEFT JOIN teams awt ON m.league_id = awt.league_id AND m.away_team_code = awt.team_code
    WHERE e.league_id = @leagueId`;

  const params = { leagueId };
  if (filters.team) {
    sql += ` AND e.team_code = @team`;
    params.team = filters.team.toUpperCase();
  }
  if (filters.minEdge) {
    sql += ` AND e.edge_pct >= @minEdge`;
    params.minEdge = filters.minEdge;
  }
  sql += ` ORDER BY e.edge_pct DESC`;

  const [rows] = await db.run({ sql, params });
  return rows.map(r => r.toJSON());
}

/**
 * Returns all prediction market prices.
 * @param {string} leagueId
 * @param {{ team?: string }} filters
 * @returns {Promise<Array>}
 */
export async function getPredictionPrices(leagueId, filters = {}) {
  const db = getDatabase();
  let sql = `SELECT p.*, m.home_team_code, m.away_team_code, m.kickoff
             FROM prediction_prices p
             JOIN matches m ON p.league_id = m.league_id AND p.match_id = m.match_id
             WHERE p.league_id = @leagueId`;
  const params = { leagueId };
  if (filters.team) {
    sql += ` AND p.team_code = @team`;
    params.team = filters.team.toUpperCase();
  }
  sql += ` ORDER BY m.kickoff, p.fetched_at DESC`;

  const [rows] = await db.run({ sql, params });
  return rows.map(r => r.toJSON());
}

// ---------------------------------------------------------------------------
// Composite: Full Group View
// ---------------------------------------------------------------------------

/**
 * Returns a complete group snapshot: all teams, matches, odds, and edges.
 * @param {string} leagueId
 * @param {string} groupLetter
 * @returns {Promise<Object>}
 */
export async function getGroupSnapshot(leagueId, groupLetter) {
  const [teams, matches] = await Promise.all([
    getTeams(leagueId, groupLetter),
    getMatches(leagueId, { group: groupLetter }),
  ]);

  const matchIds = matches.map(m => m.matchId);

  const db = getDatabase();
  let odds = [];
  let edges = [];
  let predictions = [];

  if (matchIds.length > 0) {
    const [oddsRows] = await db.run({
      sql: `SELECT * FROM odds WHERE league_id = @leagueId AND match_id IN UNNEST(@matchIds) ORDER BY fetched_at DESC`,
      params: { leagueId, matchIds },
      types: { matchIds: { type: 'array', child: { type: 'string' } } },
    });
    odds = oddsRows.map(r => r.toJSON());

    const [edgeRows] = await db.run({
      sql: `SELECT * FROM edges WHERE league_id = @leagueId AND match_id IN UNNEST(@matchIds) ORDER BY edge_pct DESC`,
      params: { leagueId, matchIds },
      types: { matchIds: { type: 'array', child: { type: 'string' } } },
    });
    edges = edgeRows.map(r => r.toJSON());

    const [predRows] = await db.run({
      sql: `SELECT * FROM prediction_prices WHERE league_id = @leagueId AND match_id IN UNNEST(@matchIds) ORDER BY fetched_at DESC`,
      params: { leagueId, matchIds },
      types: { matchIds: { type: 'array', child: { type: 'string' } } },
    });
    predictions = predRows.map(r => r.toJSON());
  }

  return { group: groupLetter, teams, matches, odds, edges, predictions };
}

// ---------------------------------------------------------------------------
// Market and Trend Queries
// ---------------------------------------------------------------------------

/**
 * Returns power ratings for a team.
 * @param {string} leagueId
 * @param {string} teamCode
 * @returns {Promise<Array>}
 */
export async function getTeamPowerRatings(leagueId, teamCode) {
  const db = getDatabase();
  const sql = `SELECT rating_id, rating, source, updated_at, created_at
               FROM team_power_ratings
               WHERE league_id = @leagueId AND team_code = @teamCode
               ORDER BY created_at DESC`;
  const [rows] = await db.run({ sql, params: { leagueId, teamCode: teamCode.toUpperCase() } });
  return rows.map(r => r.toJSON());
}

/**
 * Returns trend snapshots for a team.
 * @param {string} leagueId
 * @param {string} teamCode
 * @returns {Promise<Array>}
 */
export async function getTeamTrends(leagueId, teamCode) {
  const db = getDatabase();
  const sql = `SELECT trend_id, trend_type, wins, losses, pushes, percentage, source, updated_at
               FROM team_trends
               WHERE league_id = @leagueId AND team_code = @teamCode
               ORDER BY updated_at DESC`;
  const [rows] = await db.run({ sql, params: { leagueId, teamCode: teamCode.toUpperCase() } });
  return rows.map(r => r.toJSON());
}

/**
 * Returns injury news for a team.
 * @param {string} leagueId
 * @param {string} teamCode
 * @returns {Promise<Array>}
 */
export async function getInjuryNews(leagueId, teamCode) {
  const db = getDatabase();
  const sql = `SELECT injury_id, player_name, position, status, description, updated_at
               FROM injury_news
               WHERE league_id = @leagueId AND team_code = @teamCode
               ORDER BY updated_at DESC`;
  const [rows] = await db.run({ sql, params: { leagueId, teamCode: teamCode.toUpperCase() } });
  return rows.map(r => r.toJSON());
}

/**
 * Returns lineup projections for a match.
 * @param {string} leagueId
 * @param {string} matchId
 * @returns {Promise<Array>}
 */
export async function getLineupProjections(leagueId, matchId) {
  const db = getDatabase();
  const sql = `SELECT lineup_id, team_code, player_name, position, is_projected_starter, updated_at
               FROM lineup_projections
               WHERE league_id = @leagueId AND match_id = @matchId`;
  const [rows] = await db.run({ sql, params: { leagueId, matchId } });
  return rows.map(r => r.toJSON());
}

function parseNumeric(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && val.value !== undefined) {
    return parseFloat(val.value);
  }
  return parseFloat(val);
}

/**
 * Returns recent historical match logs for a team.
 * @param {string} leagueId
 * @param {string} teamCode
 * @param {number} [limit=20]
 * @returns {Promise<Array>}
 */
export async function getHistoricalMatches(leagueId, teamCode, limit = 20) {
  const db = getDatabase();
  const sql = `SELECT match_id, match_date, competition, opponent_code, venue_type,
                      goals_for, goals_against, result, source_url, source_name, fetched_at
               FROM historical_matches
               WHERE league_id = @leagueId AND team_code = @teamCode
               ORDER BY match_date DESC
               LIMIT @limit`;
  const params = { leagueId, teamCode: teamCode.toUpperCase(), limit };
  const [rows] = await db.run({ sql, params });
  return rows.map(r => {
    const row = r.toJSON();
    return {
      matchId: row.match_id,
      matchDate: row.match_date,
      competition: row.competition,
      opponentCode: row.opponent_code,
      venueType: row.venue_type,
      goalsFor: row.goals_for,
      goalsAgainst: row.goals_against,
      result: row.result,
      sourceUrl: row.source_url,
      sourceName: row.source_name,
      fetchedAt: row.fetched_at,
    };
  });
}

/**
 * Returns computed trends/snapshots for a team, optionally filtered by period.
 * @param {string} leagueId
 * @param {string} teamCode
 * @param {string} [period]
 * @returns {Promise<Array|Object|null>}
 */
export async function getTeamTrendSnapshot(leagueId, teamCode, period) {
  const db = getDatabase();
  let sql = `SELECT period, fifa_rank, elo_rating, form_5, form_10,
                    goals_for_avg, goals_against_avg, clean_sheet_rate,
                    over_2_5_rate, btts_rate, win_rate, updated_at
             FROM team_historical_snapshots
             WHERE league_id = @leagueId AND team_code = @teamCode`;
  const params = { leagueId, teamCode: teamCode.toUpperCase() };
  if (period) {
    sql += ` AND period = @period`;
    params.period = period;
  }
  const [rows] = await db.run({ sql, params });
  const mapped = rows.map(r => {
    const row = r.toJSON();
    return {
      period: row.period,
      fifaRank: row.fifa_rank,
      eloRating: row.elo_rating,
      form5: row.form_5,
      form10: row.form_10,
      goalsForAvg: parseNumeric(row.goals_for_avg),
      goalsAgainstAvg: parseNumeric(row.goals_against_avg),
      cleanSheetRate: parseNumeric(row.clean_sheet_rate),
      over25Rate: parseNumeric(row.over_2_5_rate),
      bttsRate: parseNumeric(row.btts_rate),
      winRate: parseNumeric(row.win_rate),
      updatedAt: row.updated_at,
    };
  });

  if (period) {
    return mapped.length > 0 ? mapped[0] : null;
  }
  return mapped;
}

/**
 * Returns computed trends/snapshots for all teams in a league, filtered by period.
 * @param {string} leagueId
 * @param {string} period
 * @returns {Promise<Array>}
 */
export async function getLeagueTrendSnapshots(leagueId, period) {
  const db = getDatabase();
  let sql = `SELECT team_code, period, fifa_rank, elo_rating, form_5, form_10,
                    goals_for_avg, goals_against_avg, clean_sheet_rate,
                    over_2_5_rate, btts_rate, win_rate, updated_at
             FROM team_historical_snapshots
             WHERE league_id = @leagueId AND period = @period
             ORDER BY win_rate DESC`;
  const params = { leagueId, period };
  const [rows] = await db.run({ sql, params });
  return rows.map(r => {
    const row = r.toJSON();
    return {
      teamCode: row.team_code,
      period: row.period,
      fifaRank: row.fifa_rank,
      eloRating: row.elo_rating,
      form5: row.form_5,
      form10: row.form_10,
      goalsForAvg: parseNumeric(row.goals_for_avg),
      goalsAgainstAvg: parseNumeric(row.goals_against_avg),
      cleanSheetRate: parseNumeric(row.clean_sheet_rate),
      over25Rate: parseNumeric(row.over_2_5_rate),
      bttsRate: parseNumeric(row.btts_rate),
      winRate: parseNumeric(row.win_rate),
      updatedAt: row.updated_at,
    };
  });
}


export async function closeSportsSpanner() {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
    console.log('[Sports-Spanner] Connection closed.');
  }
}
