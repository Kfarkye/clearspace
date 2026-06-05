// pipeline module: refresh.ts
import { Spanner } from '@google-cloud/spanner';
import crypto from 'crypto';

import { executeFetch } from './fetch.js';
import { parseVenues } from '../parsers/parse-venue.js';
import { parseTeamProfiles } from '../parsers/parse-team-profile.js';
import { parseFifaFixtures } from '../parsers/parse-fifa-fixtures.js';
import { parseOdds } from '../parsers/parse-odds.js';
import { executeNormalize } from './normalize.js';
import { executeValidate } from './validate.js';
import { executeProvenanceMerge } from './provenance.js';
import { executeUpsert } from './upsert.js';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const INSTANCE = 'aura-governance-instance';
const DATABASE = 'world-cup-db';

if (!PROJECT) {
  console.error('❌ GOOGLE_CLOUD_PROJECT environment variable is required.');
  process.exit(1);
}

const client = new Spanner({ projectId: PROJECT });
const db = client.instance(INSTANCE).database(DATABASE);

function uuid() {
  return crypto.randomUUID();
}

async function run() {
  const runId = uuid();
  const startTime = new Date().toISOString();

  console.log('🏁 Starting World Cup 2026 Ingestion Run...');
  console.log(`   Run ID: ${runId}`);

  // Get database-canonical start time to prevent client-server clock skew from deleting newly upserted data
  let dbStartTime = new Date();
  try {
    const [timeRows] = await db.run('SELECT CURRENT_TIMESTAMP() as now');
    dbStartTime = timeRows[0].toJSON().now;
  } catch (err: any) {
    console.warn(`  ⚠️ Could not fetch canonical DB time: ${err.message}. Falling back to client time.`);
  }

  console.log(`   Start:  ${startTime} (DB Time: ${dbStartTime})\n`);

  // 1. Record scrape run start in DB
  try {
    await db.table('scrape_runs').insert({
      run_id: runId,
      started_at: Spanner.COMMIT_TIMESTAMP,
      status: 'RUNNING',
      summary: null,
    });
  } catch (err: any) {
    console.warn(`  ⚠️ Could not log scrape_run start: ${err.message}`);
  }

  try {
    // 2. Fetch raw inputs (Fetch Stage)
    const rawPayloads = await executeFetch();

    // 3. Parse Raw Inputs (Parse Stage)
    console.log('🔄 [Pipeline: Parse] Parsing raw payloads into structures...');
    const parsedVenues = parseVenues(rawPayloads.venues);
    const { teams: parsedTeams, players: parsedPlayers } = parseTeamProfiles(rawPayloads.thedripTeamProfiles);
    const parsedMatches = parseFifaFixtures(rawPayloads.fifaSchedule);
    const parsedOdds = parseOdds(rawPayloads.oddsFutures);

    // 4. Normalize structure wrapper (Normalize Stage)
    const normalized = executeNormalize({
      teams: parsedTeams,
      players: parsedPlayers,
      matches: parsedMatches,
      venues: parsedVenues,
      oddsList: parsedOdds,
    });

    // 5. Validate schema details (Validate Stage)
    const validated = executeValidate(normalized);

    // 6. Merge Provenance & Resolve Conflicts (Provenance Stage)
    const merged = await executeProvenanceMerge(db, validated);

    // 7. Synchronize to Spanner (Upsert Stage)
    await executeUpsert(db, merged);

    // 7.5. Clean up stale legacy matches (whose updated_at was not updated during the current run)
    console.log('🗑️  Purging stale matches from database...');
    try {
      await db.runTransactionAsync(async txn => {
        await txn.runUpdate({
          sql: "DELETE FROM matches WHERE league_id = 'WORLD_CUP' AND updated_at < @runStart",
          params: { runStart: dbStartTime }
        });
        await txn.commit();
      });
      console.log('   ✓ Purged stale match records.');
    } catch (err: any) {
      console.warn(`  ⚠️ Failed to purge stale matches: ${err.message}`);
    }

    // 8. Record scrape run success in DB
    const duration = (Date.now() - Date.parse(startTime)) / 1000;
    const summary = {
      duration_seconds: duration,
      venues_count: parsedVenues.length,
      teams_count: parsedTeams.length,
      players_count: parsedPlayers.length,
      matches_count: parsedMatches.length,
      odds_count: parsedOdds.length,
    };

    console.log(`\n🎉 World Cup 2026 Ingestion Completed Successfully!`);
    console.log(`   Duration: ${duration}s`);
    console.log(JSON.stringify(summary, null, 2));

    try {
      await db.table('scrape_runs').update({
        run_id: runId,
        completed_at: Spanner.COMMIT_TIMESTAMP,
        status: 'SUCCESS',
        summary: JSON.stringify(summary),
      });
    } catch (err: any) {
      console.warn(`  ⚠️ Could not update scrape_run success: ${err.message}`);
    }

    await db.close();
    process.exit(0);
  } catch (error: any) {
    console.error(`\n❌ Ingestion Run Failed:`, error);
    
    try {
      await db.table('scrape_runs').update({
        run_id: runId,
        completed_at: Spanner.COMMIT_TIMESTAMP,
        status: 'FAILED',
        summary: JSON.stringify({ error: error.message || String(error) }),
      });
    } catch (err: any) {
      console.warn(`  ⚠️ Could not update scrape_run failure: ${err.message}`);
    }

    await db.close();
    process.exit(1);
  }
}

run();
