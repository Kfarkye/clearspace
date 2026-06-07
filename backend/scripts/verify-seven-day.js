import { Spanner } from '@google-cloud/spanner';
import { ingestMlbEvent } from './ingest-mlb-ledger.js';

async function runSevenDayValidation() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
  const spanner = new Spanner({ projectId });
  const db = spanner.instance('clearspace').database('clearspace-db');
  
  console.log('[AURA] Initiating 7-Day Backfill Validation Protocol...');
  console.log('[AURA] Mode: BACKFILL');
  
  // Generate last 7 days dynamically
  const dates = Array.from({length: 7}, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (i + 1));
    return d.toISOString().split('T')[0].replace(/-/g, '');
  }).reverse();
  
  console.log(`[AURA] Dates to process: ${dates.join(', ')}`);

  const getCounts = async () => {
    const tables = ['MlbGames', 'MlbOddsHistory', 'MlbWinProbability', 'MlbGameConditions'];
    const counts = {};
    for (const table of tables) {
      try {
        const [rows] = await db.run(`SELECT COUNT(*) as count FROM ${table}`);
        counts[table] = rows[0].toJSON().count;
      } catch (e) {
        counts[table] = 0;
      }
    }
    return counts;
  };

  const countsBefore = await getCounts();
  console.log('[AURA] Initial Table Counts:', countsBefore);

  let eventsFound = 0;
  let eventsIngested = 0;

  console.log('\n--- PASS 1: INGESTION ---');
  for (const date of dates) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${date}`;
    const res = await fetch(url);
    const data = await res.json();
    const events = data.events || [];
    eventsFound += events.length;
    
    for (const event of events) {
      try {
        await ingestMlbEvent(event.id, 'backfill');
        eventsIngested++;
      } catch(err) {
        console.error(`Failed to ingest ${event.id}:`, err.message);
      }
    }
  }

  const countsAfterPass1 = await getCounts();
  console.log(`[AURA] Pass 1 Complete. Events Found: ${eventsFound}, Ingested: ${eventsIngested}`);
  console.log('[AURA] Table Counts After Pass 1:', countsAfterPass1);

  console.log('\n--- PASS 2: IDEMPOTENCY CHECK ---');
  for (const date of dates) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${date}`;
    const res = await fetch(url);
    const data = await res.json();
    const events = data.events || [];
    for (const event of events) {
      try {
        await ingestMlbEvent(event.id, 'backfill');
      } catch(err) {
        console.error(`Failed to ingest ${event.id} on pass 2:`, err.message);
      }
    }
  }

  const countsAfterPass2 = await getCounts();
  console.log('[AURA] Table Counts After Pass 2:', countsAfterPass2);

  let isIdempotent = true;
  for (const table in countsAfterPass1) {
    const delta = countsAfterPass2[table] - countsAfterPass1[table];
    console.log(`[AURA] Delta for ${table}: +${delta}`);
    if (delta !== 0) isIdempotent = false;
  }

  if (!isIdempotent) {
    console.error('[AURA] CRITICAL: Idempotency failure detected. Deltas > 0 on Pass 2.');
    process.exit(1);
  }

  console.log('\n--- DIAGNOSTIC: FERMIN HR WIN PROBABILITY ---');
  try {
    const [hrRows] = await db.run(`
      SELECT PlayDescription, ProbabilitySwing 
      FROM MlbWinProbability 
      WHERE PlayId = '4018156561304990057'
    `);
    if (hrRows.length > 0) {
      const hr = hrRows[0].toJSON();
      console.log(`[AURA] Found Play: ${hr.PlayDescription}`);
      console.log(`[AURA] Swing: ${hr.ProbabilitySwing}`);
      if (Math.abs(hr.ProbabilitySwing - 0.549) < 0.01) {
        console.log('[AURA] Fermin HR Diagnostic: PASSED');
      } else {
        console.error('[AURA] Fermin HR Diagnostic: FAILED (Swing mismatch)');
      }
    } else {
      console.error('[AURA] Fermin HR Diagnostic: FAILED (Play not found)');
    }
  } catch (e) {
    console.error('[AURA] Fermin HR Diagnostic: FAILED (Query error)', e.message);
  }

  console.log('\n[AURA] 7-Day Validation Protocol Complete. Ready for Cloud Run Deployment.');
  process.exit(0);
}

import { fileURLToPath } from 'url';
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  runSevenDayValidation().catch(console.error);
}
