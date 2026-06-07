/**
 * Full-Season MLB Backfill
 * Uses the verified ingest-mlb-ledger.js with --mode backfill (idempotent upserts).
 * Covers MLB 2026 season: March 27 (Opening Day) through today.
 */
import { ingestMlbEvent } from './ingest-mlb-ledger.js';

const SEASON_START = '2026-03-27';
const DELAY_MS = 500; // 500ms between events to avoid API throttling

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function generateDateRange(startStr, endStr) {
  const dates = [];
  const current = new Date(startStr + 'T00:00:00Z');
  const end = new Date(endStr + 'T00:00:00Z');
  while (current <= end) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, '0');
    const d = String(current.getUTCDate()).padStart(2, '0');
    dates.push(`${y}${m}${d}`);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

async function backfillFullSeason() {
  const today = new Date().toISOString().split('T')[0];
  const dates = generateDateRange(SEASON_START, today);

  console.log(`[BACKFILL] Full-season MLB backfill`);
  console.log(`[BACKFILL] Range: ${SEASON_START} → ${today} (${dates.length} days)`);
  console.log(`[BACKFILL] Mode: backfill (idempotent upserts)`);

  let totalEvents = 0;
  let totalIngested = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const date of dates) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${date}`;
    let events = [];
    try {
      const res = await fetch(url);
      const data = await res.json();
      events = data.events || [];
    } catch (err) {
      console.error(`[BACKFILL] Failed to fetch scoreboard for ${date}: ${err.message}`);
      continue;
    }

    if (events.length === 0) {
      continue; // off-day
    }

    totalEvents += events.length;
    console.log(`[BACKFILL] ${date}: ${events.length} games`);

    for (const event of events) {
      try {
        await ingestMlbEvent(event.id, 'backfill');
        totalIngested++;
      } catch (err) {
        if (err.message.includes('Event or competition not found')) {
          totalSkipped++;
        } else {
          totalFailed++;
          console.error(`  ✗ ${event.id}: ${err.message}`);
        }
      }
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n[BACKFILL] ═══════════════════════════════════`);
  console.log(`[BACKFILL] Full-Season Backfill Complete`);
  console.log(`[BACKFILL] Days scanned: ${dates.length}`);
  console.log(`[BACKFILL] Events found: ${totalEvents}`);
  console.log(`[BACKFILL] Ingested:     ${totalIngested}`);
  console.log(`[BACKFILL] Skipped:      ${totalSkipped} (postponed/cancelled)`);
  console.log(`[BACKFILL] Failed:       ${totalFailed}`);
  console.log(`[BACKFILL] ═══════════════════════════════════`);

  process.exit(totalFailed > 0 ? 1 : 0);
}

backfillFullSeason().catch(err => {
  console.error('[BACKFILL] Fatal error:', err);
  process.exit(1);
});
