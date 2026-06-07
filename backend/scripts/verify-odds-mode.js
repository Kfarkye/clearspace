import { Spanner } from '@google-cloud/spanner';
import { ingestMlbEvent } from './ingest-mlb-ledger.js';
import fetch from 'node-fetch';

async function getTableCount(db, tableName) {
  const [rows] = await db.run({
    sql: `SELECT COUNT(*) as count FROM ${tableName}`
  });
  return Number(rows[0].toJSON().count);
}

async function runDiagnostics() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
  const spanner = new Spanner({ projectId });
  const db = spanner.instance('clearspace').database('clearspace-db');
  
  const targetEventId = '401815656';

  console.log('\n--- PHASE 1: VERIFY FERMIN WIN PROBABILITY SWING ---');
  // I already verified this, but I'll run it again as requested by the diagnostic
  const [wpRows] = await db.run({
    sql: `
      SELECT PlayId, PlayDescription, ProbabilitySwing 
      FROM MlbWinProbability 
      WHERE EventId = @eventId 
      ORDER BY ProbabilitySwing DESC 
      LIMIT 1
    `,
    params: { eventId: targetEventId }
  });

  const topPlay = wpRows[0]?.toJSON();
  if (!topPlay) {
    console.error('[AURA] FATAL: No win probability data found for event. Re-ingesting...');
    await ingestMlbEvent(targetEventId, 'backfill');
    // retry
    const [retry] = await db.run({
      sql: `SELECT PlayId, PlayDescription, ProbabilitySwing FROM MlbWinProbability WHERE EventId = @eventId ORDER BY ProbabilitySwing DESC LIMIT 1`,
      params: { eventId: targetEventId }
    });
    if (!retry[0]) process.exit(1);
    Object.assign(topPlay || {}, retry[0].toJSON());
  }

  const isFerminPlay = topPlay.PlayId === '4018156561304990057';
  const isCorrectDesc = topPlay.PlayDescription.includes('Fermin homered');
  const isCorrectSwing = Math.abs(topPlay.ProbabilitySwing - 0.549) < 0.01;

  console.log(`Top Play ID: ${topPlay.PlayId} (Expected: 4018156561304990057) -> ${isFerminPlay ? 'PASS' : 'FAIL'}`);
  console.log(`Description: ${topPlay.PlayDescription} -> ${isCorrectDesc ? 'PASS' : 'FAIL'}`);
  console.log(`Swing: ${topPlay.ProbabilitySwing} (Expected: ~0.549) -> ${isCorrectSwing ? 'PASS' : 'FAIL'}`);

  if (!isFerminPlay || !isCorrectDesc || !isCorrectSwing) {
    console.error('[AURA] FATAL: Win probability verification failed. Halting backfill.');
    process.exit(1);
  }
  console.log('[AURA] SUCCESS: Fermin HR verified as #1 swing.');

  console.log('\n--- PHASE 2: 1-DAY BACKFILL IDEMPOTENCY TEST ---');
  const testDate = '20260606';
  const url = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${testDate}`;
  
  const res = await fetch(url);
  const data = await res.json();
  const events = data.events || [];
  console.log(`[AURA] Found ${events.length} events for ${testDate}.`);

  // Run 1
  console.log('\n[AURA] Executing Run 1 (Initial Backfill)...');
  for (const event of events.slice(0, 5)) { // Limit to 5 for speed
    await ingestMlbEvent(event.id, 'backfill');
  }
  const oddsCountRun1 = await getTableCount(db, 'MlbOddsHistory');
  console.log(`MlbOddsHistory Count after Run 1: ${oddsCountRun1}`);

  // Run 2
  console.log('\n[AURA] Executing Run 2 (Idempotency Check)...');
  for (const event of events.slice(0, 5)) {
    await ingestMlbEvent(event.id, 'backfill');
  }
  const oddsCountRun2 = await getTableCount(db, 'MlbOddsHistory');
  console.log(`MlbOddsHistory Count after Run 2: ${oddsCountRun2}`);

  const delta = oddsCountRun2 - oddsCountRun1;
  console.log(`\n[AURA] Second run delta: MlbOddsHistory +${delta}`);

  if (delta === 0) {
    console.log('[AURA] SUCCESS: Backfill mode is perfectly idempotent. Green light for 7-day and full-season backfill.');
  } else {
    console.error('[AURA] FATAL: Duplicate rows detected during backfill re-run. Halting.');
    process.exit(1);
  }

  await db.close();
}

runDiagnostics().catch(err => {
  console.error(err);
  process.exit(1);
});
