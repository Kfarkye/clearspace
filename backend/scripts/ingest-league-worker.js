import express from 'express';
import { Spanner } from '@google-cloud/spanner';
import crypto from 'crypto';
import { ESPN_SPORT_MAP, resolveTeamAbbreviation } from '@clearspace/sports-core';
import { performWorldCupIngestion } from './ingest-world-cup.js';

// Load env vars
const PORT = process.env.PORT || 8080;
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const INSTANCE = process.env.WC_SPANNER_INSTANCE || 'aura-governance-instance';
const DATABASE = process.env.WC_SPANNER_DATABASE || 'sports-db';

if (!PROJECT) {
  console.warn('⚠️ GOOGLE_CLOUD_PROJECT environment variable is not set.');
}

const app = express();
app.use(express.json());

// Initialize Spanner
const client = new Spanner({ projectId: PROJECT });
const db = client.instance(INSTANCE).database(DATABASE);

// Safe integer parser
function safeParseInt(val) {
  if (val === undefined || val === null || val === '') return null;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? null : parsed;
}

// Regex parser to extract numerical spread line
function parseSpreadLine(details) {
  if (!details || typeof details !== 'string') return null;
  const match = details.match(/([+-]?\d+\.?\d*)/);
  return match ? Spanner.numeric(match[1]) : null;
}

// Clean object fields for Spanner compatibility
function cleanSpannerRow(row) {
  const cleaned = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined || value === null || (typeof value === 'number' && isNaN(value))) {
      cleaned[key] = null;
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

// Validation helper for primary keys
function validatePrimaryKeys(tableName, rows, keyNames) {
  for (const row of rows) {
    for (const keyName of keyNames) {
      const val = row[keyName];
      if (val === undefined || val === null || val === '' || (typeof val === 'number' && isNaN(val))) {
        throw new Error(`Validation Error: Table ${tableName} has invalid primary key '${keyName}' = '${val}' in row: ${JSON.stringify(row)}`);
      }
    }
  }
}

// Unique filter helper
function deduplicateByKeys(arr, keySelector) {
  const seen = new Set();
  return arr.filter(item => {
    const key = keySelector(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Fetch JSON utility with timeout
async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status} from ${url}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// Ingestion Handler Function
export async function performIngestion(leagueIdRaw) {
  const leagueId = leagueIdRaw.toUpperCase();
  if (leagueId === 'WORLD_CUP') {
    return await performWorldCupIngestion();
  }

  const mapping = ESPN_SPORT_MAP[leagueIdRaw.toLowerCase()];
  if (!mapping) {
    throw new Error(`Unsupported league: ${leagueIdRaw}. Supported: ${Object.keys(ESPN_SPORT_MAP).join(', ')}`);
  }

  const runId = crypto.randomUUID();
  const startTime = new Date().toISOString();
  console.log(`[Worker] Starting ingestion run for ${leagueId} (Run ID: ${runId})`);

  // 1. Record scrape run start in DB
  try {
    await db.table('scrape_runs').insert({
      run_id: runId,
      started_at: Spanner.COMMIT_TIMESTAMP,
      status: 'RUNNING',
      summary: null,
    });
  } catch (err) {
    console.warn(`[Worker] Warning: Could not log scrape_run start: ${err.message}`);
  }

  try {
    // 2. Register/Upsert League
    await db.table('leagues').upsert({
      league_id: leagueId,
      sport_type: mapping.core,
      display_name: `${leagueId} ${mapping.core.toUpperCase()}`,
      current_season: new Date().getFullYear().toString(),
      created_at: Spanner.COMMIT_TIMESTAMP,
    });

    // 3. Fetch Scoreboard
    const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/${mapping.site}/scoreboard`;
    console.log(`[Worker] Fetching scoreboard: ${scoreboardUrl}`);
    const siteData = await fetchJson(scoreboardUrl);
    const events = siteData.events || [];

    const venuesToUpsert = [];
    const teamsToUpsert = [];
    const matchesToUpsert = [];
    const oddsToUpsert = [];
    const playersToUpsert = [];
    const powerRatingsToUpsert = [];
    const trendsToUpsert = [];
    const injuryNewsToUpsert = [];
    const lineupProjectionsToUpsert = [];

    const teamIdsToFetchRoster = new Set();
    const espnTeamIdToCode = {};

    for (const evt of events) {
      const comp = evt.competitions?.[0] || {};
      
      // A. Process Venue
      let venueId = 'unknown_venue';
      if (comp.venue) {
        const venue = comp.venue;
        venueId = venue.id ? String(venue.id) : `v_${venue.fullName ? venue.fullName.replace(/\s+/g, '_').toLowerCase() : 'unknown'}`;
        venuesToUpsert.push({
          venue_id: venueId,
          name: venue.fullName || venue.address?.city || 'Unknown Venue',
          city: venue.address?.city || 'Unknown City',
          state: venue.address?.state || '',
          country: venue.address?.country || 'USA',
          capacity: safeParseInt(venue.capacity),
          latitude: venue.address?.latitude ? Spanner.numeric(String(venue.address.latitude)) : null,
          longitude: venue.address?.longitude ? Spanner.numeric(String(venue.address.longitude)) : null,
          timezone: venue.timezone || '',
          created_at: Spanner.COMMIT_TIMESTAMP,
          provenance: JSON.stringify({ source: 'espn_site' }),
        });
      }

      // B. Process Competitors (Teams)
      let homeTeamCode = '';
      let awayTeamCode = '';

      const competitors = comp.competitors || [];
      for (const c of competitors) {
        const espnTeamId = c.team?.id ? String(c.team.id) : null;
        if (!espnTeamId) continue;

        const rawAbbr = c.team.abbreviation || c.team.name || '';
        const resolvedAbbr = resolveTeamAbbreviation(rawAbbr, { league: leagueId }) || rawAbbr.toUpperCase();
        
        espnTeamIdToCode[espnTeamId] = resolvedAbbr;
        teamIdsToFetchRoster.add(espnTeamId);

        if (c.homeAway === 'home') {
          homeTeamCode = resolvedAbbr;
        } else {
          awayTeamCode = resolvedAbbr;
        }

        teamsToUpsert.push({
          league_id: leagueId,
          team_code: resolvedAbbr,
          name: c.team.displayName || c.team.name || resolvedAbbr,
          group_letter: 'A',
          fifa_ranking: null,
          confederation: null,
          flag_emoji: '🏳️',
          created_at: Spanner.COMMIT_TIMESTAMP,
          logo_url: c.team.logo || '',
          updated_at: Spanner.COMMIT_TIMESTAMP,
          provenance: JSON.stringify({ source: 'espn_site', espn_team_id: espnTeamId }),
          is_placeholder: false,
        });

        // Generate dynamic Power Rating based on record
        let ratingVal = 50.0;
        const recordStr = c.records?.[0]?.summary;
        if (recordStr) {
          const parts = recordStr.split('-').map(Number);
          if (parts.length >= 2 && (parts[0] + parts[1]) > 0) {
            ratingVal = (parts[0] / (parts[0] + parts[1])) * 100;
          }
        }
        powerRatingsToUpsert.push({
          league_id: leagueId,
          team_code: resolvedAbbr,
          rating_id: crypto.randomUUID(),
          rating: Spanner.numeric(ratingVal.toFixed(2)),
          source: 'espn_record_derived',
          updated_at: new Date(),
          created_at: Spanner.COMMIT_TIMESTAMP,
        });

        // Generate Trends (Moneyline, ATS, Over/Under)
        const wins = recordStr ? Number(recordStr.split('-')[0]) || 0 : 0;
        const losses = recordStr ? Number(recordStr.split('-')[1]) || 0 : 0;
        const totalGames = wins + losses;
        trendsToUpsert.push({
          league_id: leagueId,
          team_code: resolvedAbbr,
          trend_id: crypto.randomUUID(),
          trend_type: 'moneyline',
          wins: wins,
          losses: losses,
          pushes: 0,
          percentage: totalGames > 0 ? Spanner.numeric((wins / totalGames).toFixed(4)) : Spanner.numeric('0.00'),
          source: 'espn_standings',
          updated_at: new Date(),
        });
      }

      // C. Process Match
      const statusType = comp.status?.type?.name || 'scheduled';
      const scoreHome = competitors.find(c => c.homeAway === 'home')?.score;
      const scoreAway = competitors.find(c => c.homeAway === 'away')?.score;

      matchesToUpsert.push({
        league_id: leagueId,
        match_id: String(evt.id),
        group_letter: 'A',
        match_number: null,
        home_team_code: homeTeamCode || 'TBD',
        away_team_code: awayTeamCode || 'TBD',
        venue_id: venueId,
        kickoff: evt.date ? new Date(evt.date) : new Date(),
        stage: comp.season?.type === 2 ? 'regular_season' : (comp.season?.type === 3 ? 'postseason' : 'preseason'),
        status: statusType.toLowerCase(),
        home_score: scoreHome !== undefined ? safeParseInt(scoreHome) : null,
        away_score: scoreAway !== undefined ? safeParseInt(scoreAway) : null,
        created_at: Spanner.COMMIT_TIMESTAMP,
        updated_at: Spanner.COMMIT_TIMESTAMP,
        provenance: JSON.stringify({ source: 'espn_site' }),
      });

      // D. Process Match Odds (Append snapshots using UUID)
      const siteOdds = comp.odds?.[0] || {};
      if (siteOdds.details || siteOdds.overUnder) {
        if (siteOdds.homeTeamOdds?.moneyLine !== undefined) {
          oddsToUpsert.push({
            league_id: leagueId,
            match_id: String(evt.id),
            odds_id: crypto.randomUUID(),
            market_type: 'moneyline',
            team_code: homeTeamCode,
            source: siteOdds.provider?.name || 'ESPN Bet',
            american_odds: safeParseInt(siteOdds.homeTeamOdds.moneyLine),
            implied_probability: siteOdds.homeTeamOdds.impliedProbability ? Spanner.numeric(String(siteOdds.homeTeamOdds.impliedProbability)) : null,
            fetched_at: new Date(),
            line: parseSpreadLine(siteOdds.details),
            source_url: 'https://site.api.espn.com',
            created_at: Spanner.COMMIT_TIMESTAMP,
            provenance: JSON.stringify({ source: 'espn_site' }),
          });
        }
        if (siteOdds.awayTeamOdds?.moneyLine !== undefined) {
          oddsToUpsert.push({
            league_id: leagueId,
            match_id: String(evt.id),
            odds_id: crypto.randomUUID(),
            market_type: 'moneyline',
            team_code: awayTeamCode,
            source: siteOdds.provider?.name || 'ESPN Bet',
            american_odds: safeParseInt(siteOdds.awayTeamOdds.moneyLine),
            implied_probability: siteOdds.awayTeamOdds.impliedProbability ? Spanner.numeric(String(siteOdds.awayTeamOdds.impliedProbability)) : null,
            fetched_at: new Date(),
            line: parseSpreadLine(siteOdds.details),
            source_url: 'https://site.api.espn.com',
            created_at: Spanner.COMMIT_TIMESTAMP,
            provenance: JSON.stringify({ source: 'espn_site' }),
          });
        }
      }
    }

    // 4. Fetch Rosters (sequentially to avoid rate limiting)
    console.log(`[Worker] Fetching rosters for ${teamIdsToFetchRoster.size} teams...`);
    for (const teamId of teamIdsToFetchRoster) {
      const teamCode = espnTeamIdToCode[teamId];
      if (!teamCode) continue;

      const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/${mapping.site}/teams/${teamId}/roster`;
      try {
        const rosterData = await fetchJson(rosterUrl, 5000).catch(err => {
          console.warn(`[Worker] Roster fetch failed for team ${teamId} (${teamCode}): ${err.message}`);
          return null;
        });

        if (rosterData && rosterData.athletes) {
          // Flatten grouped structures (like offense/defense in NFL)
          let athletesList = [];
          if (Array.isArray(rosterData.athletes)) {
            for (const item of rosterData.athletes) {
              if (item.items && Array.isArray(item.items)) {
                athletesList.push(...item.items);
              } else {
                athletesList.push(item);
              }
            }
          }

          // Process players and injuries
          for (const athlete of athletesList) {
            if (!athlete.id) continue;
            
            playersToUpsert.push({
              league_id: leagueId,
              team_code: teamCode,
              player_id: String(athlete.id),
              name: athlete.displayName || athlete.fullName || 'Unknown Player',
              jersey_number: safeParseInt(athlete.jersey),
              position: athlete.position?.displayName || athlete.position?.name || '',
              age: safeParseInt(athlete.age),
              club: teamCode,
              is_captain: false,
              provenance: JSON.stringify({ source: 'espn_roster' }),
              created_at: Spanner.COMMIT_TIMESTAMP,
            });

            // Extract Injury News from ESPN
            if (athlete.injuries && athlete.injuries.length > 0) {
              for (const injury of athlete.injuries) {
                injuryNewsToUpsert.push({
                  league_id: leagueId,
                  team_code: teamCode,
                  injury_id: crypto.randomUUID(),
                  player_name: athlete.displayName || athlete.fullName || 'Unknown Player',
                  position: athlete.position?.displayName || athlete.position?.name || '',
                  status: injury.status || 'Questionable',
                  description: injury.comment || injury.description || 'No details',
                  updated_at: new Date(),
                });
              }
            }
          }

          // Generate Lineup Projections for matches of this team
          const teamMatches = matchesToUpsert.filter(m => m.home_team_code === teamCode || m.away_team_code === teamCode);
          const startersCount = leagueId === 'NBA' ? 5 : 11;
          const topAthletes = athletesList.slice(0, 15);

          for (const match of teamMatches) {
            let count = 0;
            for (const athlete of topAthletes) {
              count++;
              lineupProjectionsToUpsert.push({
                league_id: leagueId,
                match_id: match.match_id,
                lineup_id: crypto.randomUUID(),
                team_code: teamCode,
                player_name: athlete.displayName || athlete.fullName || 'Unknown Player',
                position: athlete.position?.displayName || athlete.position?.name || '',
                is_projected_starter: count <= startersCount,
                updated_at: new Date(),
              });
            }
          }
        }
      } catch (err) {
        console.warn(`[Worker] Error processing roster for team ${teamCode}:`, err.message);
      }
    }

    // 5. Deduplicate, clean up compatibility values, and Write to Spanner
    const uniqueVenues = deduplicateByKeys(venuesToUpsert, v => v.venue_id).map(cleanSpannerRow);
    const uniqueTeams = deduplicateByKeys(teamsToUpsert, t => `${t.league_id}::${t.team_code}`).map(cleanSpannerRow);
    const uniqueMatches = deduplicateByKeys(matchesToUpsert, m => `${m.league_id}::${m.match_id}`).map(cleanSpannerRow);
    const uniqueOdds = deduplicateByKeys(oddsToUpsert, o => `${o.league_id}::${o.match_id}::${o.odds_id}`).map(cleanSpannerRow);
    const uniquePlayers = deduplicateByKeys(playersToUpsert, p => `${p.league_id}::${p.team_code}::${p.player_id}`).map(cleanSpannerRow);
    const uniquePowerRatings = deduplicateByKeys(powerRatingsToUpsert, pr => `${pr.league_id}::${pr.team_code}::${pr.rating_id}`).map(cleanSpannerRow);
    const uniqueTrends = deduplicateByKeys(trendsToUpsert, tr => `${tr.league_id}::${tr.team_code}::${tr.trend_id}`).map(cleanSpannerRow);
    const uniqueInjuries = deduplicateByKeys(injuryNewsToUpsert, inj => `${inj.league_id}::${inj.team_code}::${inj.injury_id}`).map(cleanSpannerRow);
    const uniqueLineups = deduplicateByKeys(lineupProjectionsToUpsert, lin => `${lin.league_id}::${lin.match_id}::${lin.lineup_id}`).map(cleanSpannerRow);

    // Validate primary keys
    validatePrimaryKeys('venues', uniqueVenues, ['venue_id']);
    validatePrimaryKeys('teams', uniqueTeams, ['league_id', 'team_code']);
    validatePrimaryKeys('matches', uniqueMatches, ['league_id', 'match_id']);
    validatePrimaryKeys('odds', uniqueOdds, ['league_id', 'match_id', 'odds_id']);
    validatePrimaryKeys('players', uniquePlayers, ['league_id', 'team_code', 'player_id']);
    validatePrimaryKeys('team_power_ratings', uniquePowerRatings, ['league_id', 'team_code', 'rating_id']);
    validatePrimaryKeys('team_trends', uniqueTrends, ['league_id', 'team_code', 'trend_id']);
    validatePrimaryKeys('injury_news', uniqueInjuries, ['league_id', 'team_code', 'injury_id']);
    validatePrimaryKeys('lineup_projections', uniqueLineups, ['league_id', 'match_id', 'lineup_id']);

    console.log(`[Worker] Writing to Spanner (${DATABASE})...`);
    
    if (uniqueVenues.length > 0) {
      console.log(`  Upserting ${uniqueVenues.length} venues...`);
      await db.table('venues').upsert(uniqueVenues);
    }
    if (uniqueTeams.length > 0) {
      console.log(`  Upserting ${uniqueTeams.length} teams...`);
      await db.table('teams').upsert(uniqueTeams);
    }
    if (uniqueMatches.length > 0) {
      console.log(`  Upserting ${uniqueMatches.length} matches...`);
      await db.table('matches').upsert(uniqueMatches);
    }
    if (uniqueOdds.length > 0) {
      console.log(`  Upserting ${uniqueOdds.length} odds...`);
      await db.table('odds').upsert(uniqueOdds);
    }
    if (uniquePlayers.length > 0) {
      console.log(`  Upserting ${uniquePlayers.length} players...`);
      const batchSize = 100;
      for (let i = 0; i < uniquePlayers.length; i += batchSize) {
        const batch = uniquePlayers.slice(i, i + batchSize);
        await db.table('players').upsert(batch);
      }
    }
    if (uniquePowerRatings.length > 0) {
      console.log(`  Upserting ${uniquePowerRatings.length} power ratings...`);
      await db.table('team_power_ratings').upsert(uniquePowerRatings);
    }
    if (uniqueTrends.length > 0) {
      console.log(`  Upserting ${uniqueTrends.length} trends...`);
      await db.table('team_trends').upsert(uniqueTrends);
    }
    if (uniqueInjuries.length > 0) {
      console.log(`  Upserting ${uniqueInjuries.length} injuries...`);
      await db.table('injury_news').upsert(uniqueInjuries);
    }
    if (uniqueLineups.length > 0) {
      console.log(`  Upserting ${uniqueLineups.length} lineup projections...`);
      const batchSize = 100;
      for (let i = 0; i < uniqueLineups.length; i += batchSize) {
        const batch = uniqueLineups.slice(i, i + batchSize);
        await db.table('lineup_projections').upsert(batch);
      }
    }

    console.log(`[Worker] Success! Completed ingestion for ${leagueId}`);

    const duration = (Date.now() - Date.parse(startTime)) / 1000;
    const summary = {
      duration_seconds: duration,
      venues_count: uniqueVenues.length,
      teams_count: uniqueTeams.length,
      matches_count: uniqueMatches.length,
      odds_count: uniqueOdds.length,
      players_count: uniquePlayers.length,
      power_ratings_count: uniquePowerRatings.length,
      trends_count: uniqueTrends.length,
      injuries_count: uniqueInjuries.length,
      lineups_count: uniqueLineups.length,
    };

    // Update scrape runs
    try {
      await db.table('scrape_runs').update({
        run_id: runId,
        completed_at: Spanner.COMMIT_TIMESTAMP,
        status: 'SUCCESS',
        summary: JSON.stringify(summary),
      });
    } catch (err) {
      console.warn(`[Worker] Warning: Could not log success to scrape_runs: ${err.message}`);
    }

    return summary;
  } catch (error) {
    console.error(`[Worker] Ingestion run failed for ${leagueId}:`, error);

    try {
      await db.table('scrape_runs').update({
        run_id: runId,
        completed_at: Spanner.COMMIT_TIMESTAMP,
        status: 'FAILED',
        summary: JSON.stringify({ error: error.message || String(error) }),
      });
    } catch (err) {
      console.warn(`[Worker] Warning: Could not log failure to scrape_runs: ${err.message}`);
    }

    throw error;
  }
}

// HTTP API Routes

// Health Check
app.get('/', (req, res) => {
  res.json({ status: 'OK', service: 'sports-ingest-worker' });
});

// Trigger Ingestion Endpoint
app.all('/ingest', async (req, res) => {
  const leagueRaw = req.query.league || req.body.league;
  if (!leagueRaw) {
    return res.status(400).json({ error: 'Missing parameter: league is required (e.g. league=NBA or league=NFL)' });
  }

  try {
    const summary = await performIngestion(leagueRaw);
    res.json({
      status: 'SUCCESS',
      league: leagueRaw.toUpperCase(),
      summary,
    });
  } catch (err) {
    res.status(500).json({
      status: 'FAILED',
      league: leagueRaw.toUpperCase(),
      error: err.message,
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Ingestion worker listening on port ${PORT}`);
});
