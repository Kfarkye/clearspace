import { Spanner } from '@google-cloud/spanner';
import { ingestMlbEvent } from './ingest-mlb-ledger.js';

const spanner = new Spanner({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829' });
const instance = spanner.instance('clearspace');
const db = instance.database('clearspace-db');

const TABLES = [
  'MlbGames', 
  'MlbPlayByPlay', 
  'MlbWinProbability', 
  'MlbBoxscorePitching', 
  'MlbBoxscoreBatting', 
  'MlbOddsHistory', 
  'MlbInjuries', 
  'MlbGameStandings', 
  'MlbSeasonSeries'
];

async function getTableCounts() {
  const counts = {};
  for (const table of TABLES) {
    try {
      const [rows] = await db.run(`SELECT COUNT(*) as count FROM ${table}`);
      counts[table] = Number(rows[0].toJSON().count);
    } catch (error) {
      counts[table] = 'ERR_MISSING_TABLE';
    }
  }
  return counts;
}

async function printCountDiff(label, before, after) {
  console.log(`\n--- ${label} ---`);
  console.table(
    TABLES.map(table => ({
      Table: table,
      Before: before[table],
      After: after[table],
      Delta: typeof after[table] === 'number' && typeof before[table] === 'number' 
        ? after[table] - before[table] 
        : 'N/A'
    }))
  );
}

async function verifyGameState(eventId, stateLabel) {
  console.log(`\n[AURA] Verifying ${stateLabel} Game State (Event: ${eventId})...`);
  const countsBefore = await getTableCounts();
  
  try {
    await ingestMlbEvent(eventId);
  } catch (error) {
    console.error(`[AURA] FATAL: Ingestion failed for ${stateLabel} event ${eventId}`, error.message);
    return;
  }

  const countsAfter = await getTableCounts();
  await printCountDiff(`${stateLabel} Ingestion (Event: ${eventId})`, countsBefore, countsAfter);

  // Fetch and display sample MlbGames row
  try {
    const [rows] = await db.run({
      sql: `SELECT EventId, Status, HomeTeamAbbrev, AwayTeamAbbrev FROM MlbGames WHERE EventId = @eventId LIMIT 1`,
      params: { eventId: String(eventId) }
    });
    if (rows.length > 0) {
      console.log(`[AURA] Sample MlbGames Row for ${eventId}:`, rows[0].toJSON());
    } else {
      console.log(`[AURA] WARNING: No MlbGames row found for ${eventId} after ingestion.`);
    }
  } catch (error) {
    // Silently handle query error, likely schema mismatch
  }
}

async function runLifecycleVerification() {
  console.log('[AURA] Initiating MLB Ledger Idempotency & Lifecycle Verification...');

  // 1. Idempotency Test (Live/Recent Game)
  const targetEventId = '401815656';
  console.log(`\n[AURA] Phase 1: Idempotency Test on Event ${targetEventId}`);
  const initialCounts = await getTableCounts();
  
  await ingestMlbEvent(targetEventId);
  const postRun1Counts = await getTableCounts();
  await printCountDiff('First Run (Baseline)', initialCounts, postRun1Counts);

  await ingestMlbEvent(targetEventId);
  const postRun2Counts = await getTableCounts();
  await printCountDiff('Second Run (Idempotency Check - Deltas should be 0)', postRun1Counts, postRun2Counts);

  // 2. Multi-State Coverage Test
  // Note: Replace these IDs with actual known scheduled/final event IDs for the current date
  const SCHEDULED_EVENT_ID = '401815660'; // Example Scheduled
  const FINAL_EVENT_ID = '401815650';     // Example Final

  console.log('\n[AURA] Phase 2: Multi-State Coverage Test');
  await verifyGameState(SCHEDULED_EVENT_ID, 'SCHEDULED');
  await verifyGameState(FINAL_EVENT_ID, 'FINAL');

  console.log('\n[AURA] Verification Complete. If deltas on Run 2 are 0, and Scheduled/Final ingested cleanly, authorize Season Backfill.');
  process.exit(0);
}

runLifecycleVerification().catch(err => {
  console.error('[AURA] Unhandled Rejection in Verification Harness:', err);
  process.exit(1);
});
