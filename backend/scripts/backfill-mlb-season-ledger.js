import fetch from 'node-fetch';
import { ingestMlbEvent } from './ingest-mlb-ledger.js';

// Parse args
const args = process.argv.slice(2);
let start = null;
let end = null;
let dryRun = false;
let limit = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--start') start = args[++i];
  if (args[i] === '--end') end = args[++i];
  if (args[i] === '--dry-run') dryRun = true;
  if (args[i] === '--limit') limit = parseInt(args[++i], 10);
}

// Ensure defaults
if (!start || !end) {
  console.error("Usage: node backfill-mlb-season-ledger.js --start YYYYMMDD --end YYYYMMDD [--dry-run] [--limit N]");
  process.exit(1);
}

function parseDateString(str) {
  const y = parseInt(str.slice(0, 4), 10);
  const m = parseInt(str.slice(4, 6), 10) - 1;
  const d = parseInt(str.slice(6, 8), 10);
  return new Date(y, m, d);
}

function formatDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const startDate = parseDateString(start);
  const endDate = parseDateString(end);

  const stats = {
    datesProcessed: 0,
    eventsFound: 0,
    eventsSucceeded: 0,
    eventsFailed: 0,
    failedEventIds: []
  };

  const startTime = Date.now();

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = formatDateString(d);
    console.log(`\nFetching scoreboard for date: ${dateStr}`);
    
    try {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateStr}`);
      if (!res.ok) {
        console.error(`Failed to fetch scoreboard for ${dateStr}: ${res.status}`);
        continue;
      }
      const data = await res.json();
      const events = data.events || [];
      
      stats.datesProcessed++;
      console.log(`Found ${events.length} events for ${dateStr}`);

      for (const event of events) {
        if (limit !== null && stats.eventsFound >= limit) {
          console.log(`Limit of ${limit} reached. Stopping.`);
          break;
        }

        const eventId = event.id;
        stats.eventsFound++;
        console.log(`Processing eventId: ${eventId}`);

        if (!dryRun) {
          try {
            await ingestMlbEvent(eventId, 'backfill');
            stats.eventsSucceeded++;
          } catch (err) {
            console.error(`Failed to ingest event ${eventId}:`, err);
            stats.eventsFailed++;
            stats.failedEventIds.push(eventId);
          }
          // Sleep between 750 and 1500ms
          const sleepMs = 750 + Math.random() * 750;
          await sleep(sleepMs);
        } else {
          console.log(`[DRY RUN] Would ingest event ${eventId}`);
          stats.eventsSucceeded++;
        }
      }

      if (limit !== null && stats.eventsFound >= limit) {
        break;
      }
    } catch (error) {
      console.error(`Error processing date ${dateStr}:`, error);
    }
  }

  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n--- FINAL SUMMARY ---');
  console.log(`Dates processed:   ${stats.datesProcessed}`);
  console.log(`Events found:      ${stats.eventsFound}`);
  console.log(`Events succeeded:  ${stats.eventsSucceeded}`);
  console.log(`Events failed:     ${stats.eventsFailed}`);
  console.log(`Elapsed time:      ${elapsedSeconds}s`);
  if (stats.failedEventIds.length > 0) {
    console.log(`Failed event IDs:  ${stats.failedEventIds.join(', ')}`);
  }
  console.log('---------------------\n');
}

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
