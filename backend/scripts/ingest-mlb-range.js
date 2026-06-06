/**
 * @fileoverview Seeds real MLB match data into Spanner for a specific date range.
 * Loops through June 1, 2026 to June 8, 2026 and triggers the ingestion worker.
 */

import { performIngestion } from './ingest-league-worker.js';

// ============================================================================
// Configuration
// ============================================================================
const START_DATE = new Date('2026-06-01T00:00:00Z');
const END_DATE = new Date('2026-06-08T00:00:00Z');
const LEAGUE = 'mlb';
const DELAY_MS = 2000; // 2 seconds between requests to respect API rate limits

// ============================================================================
// Utilities
// ============================================================================

/**
 * Pauses execution for a specified duration.
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Formats a Date object to YYYYMMDD string.
 * @param {Date} dateObj - The date to format.
 * @returns {string} Formatted date string.
 */
function formatDateToYYYYMMDD(dateObj) {
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// ============================================================================
// Core Execution
// ============================================================================

async function seedMlbRange() {
  console.log(`Starting MLB data ingestion from ${formatDateToYYYYMMDD(START_DATE)} to ${formatDateToYYYYMMDD(END_DATE)}...`);
  
  const currentDate = new Date(START_DATE);
  let totalIngested = 0;
  let successCount = 0;
  let failureCount = 0;

  while (currentDate <= END_DATE) {
    const dateStr = formatDateToYYYYMMDD(currentDate);
    console.log(`\n--- Processing Date: ${dateStr} ---`);
    
    try {
      const result = await performIngestion(LEAGUE, dateStr);
      console.log(`✅ Success: Ingested ${result.eventsIngested} matches for ${dateStr}.`);
      totalIngested += result.eventsIngested;
      successCount++;
    } catch (error) {
      console.error(`❌ Failed: Could not ingest data for ${dateStr}.`);
      console.error(`   Reason: ${error.message}`);
      failureCount++;
      // We continue to the next day even if one fails
    }

    // Move to the next day
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);

    // Apply delay to prevent rate limiting, unless it's the last iteration
    if (currentDate <= END_DATE) {
      console.log(`Sleeping for ${DELAY_MS}ms before next request...`);
      await sleep(DELAY_MS);
    }
  }

  // Final Summary
  console.log('\n========================================');
  console.log('Ingestion Range Complete!');
  console.log(`Total Matches Ingested: ${totalIngested}`);
  console.log(`Successful Days: ${successCount}`);
  console.log(`Failed Days: ${failureCount}`);
  console.log('========================================');
}

// Execute the seeder
seedMlbRange().catch(error => {
  console.error('Fatal error in seeding script:', error);
  process.exit(1);
});
