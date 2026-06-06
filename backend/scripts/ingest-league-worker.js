/**
 * @fileoverview Express ingestion worker for sports data into Spanner.
 * Supports optional date parameters for historical data backfilling.
 */

import express from 'express';
import { Spanner } from '@google-cloud/spanner';

// ============================================================================
// Configuration & Setup
// ============================================================================
const app = express();
app.use(express.json());

// Initialize Spanner client
// ASSUMPTION: Environment variables are set for Google Cloud authentication.
const spanner = new Spanner({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'your-project-id',
});
const instance = spanner.instance(process.env.WC_SPANNER_INSTANCE || 'your-instance');
const database = instance.database(process.env.WC_SPANNER_DATABASE || 'your-database');
const matchesTable = database.table('matches');

// Map leagues to ESPN URL sport paths
const SPORT_MAPPING = {
  mlb: 'baseball',
  nba: 'basketball',
  nfl: 'football',
  nhl: 'hockey'
};

// ============================================================================
// Core Ingestion Logic
// ============================================================================

/**
 * Validates a date string ensures it matches YYYYMMDD format.
 * @param {string} dateStr - The date string to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
function isValidDate(dateStr) {
  if (!dateStr) return false;
  return /^\d{8}$/.test(dateStr);
}

/**
 * Fetches data from ESPN API and ingests it into Spanner.
 * @param {string} leagueIdRaw - The league identifier (e.g., 'mlb').
 * @param {string} [date] - Optional date in YYYYMMDD format.
 * @returns {Promise<Object>} Summary of the ingestion process.
 */
async function performIngestion(leagueIdRaw, date) {
  const league = leagueIdRaw.toLowerCase();
  const sport = SPORT_MAPPING[league];

  if (!sport) {
    throw new Error(`Unsupported league: ${leagueIdRaw}`);
  }

  // 1. Construct API URL
  let url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`;
  if (date) {
    if (!isValidDate(date)) {
      throw new Error(`Invalid date format: ${date}. Expected YYYYMMDD.`);
    }
    url += `?dates=${date}`;
  }

  console.log(`[Ingestion] Fetching data from: ${url}`);

  // 2. Fetch Data
  let data;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ESPN API returned status ${response.status}`);
    }
    data = await response.json();
  } catch (error) {
    console.error(`[Ingestion] Failed to fetch data for ${league}:`, error.message);
    throw new Error(`Network failure during fetch: ${error.message}`);
  }

  // 3. Parse and Prepare Spanner Mutations
  if (!data.events || !Array.isArray(data.events) || data.events.length === 0) {
    console.log(`[Ingestion] No events found for ${league} on date ${date || 'today'}.`);
    return { status: 'success', eventsIngested: 0, date: date || 'today' };
  }

  const rowsToInsert = data.events.map(event => {
    // ASSUMPTION: The Spanner matches table has these basic columns.
    // Adjust column names/types to match your exact schema.
    const homeCompetitor = event.competitions[0].competitors.find(c => c.homeAway === 'home');
    const awayCompetitor = event.competitions[0].competitors.find(c => c.homeAway === 'away');

    return {
      id: event.id,
      league: league,
      date: date || event.date.substring(0, 10).replace(/-/g, ''), // Fallback to event date YYYYMMDD
      home_team: homeCompetitor?.team?.displayName || 'Unknown',
      away_team: awayCompetitor?.team?.displayName || 'Unknown',
      home_score: parseInt(homeCompetitor?.score || '0', 10),
      away_score: parseInt(awayCompetitor?.score || '0', 10),
      status: event.status.type.name,
      updated_at: Spanner.COMMIT_TIMESTAMP
    };
  });

  // 4. Write to Spanner (Upsert to replace existing empty records)
  try {
    await matchesTable.upsert(rowsToInsert);
    console.log(`[Ingestion] Successfully upserted ${rowsToInsert.length} matches for ${league}.`);
  } catch (error) {
    console.error(`[Ingestion] Spanner write failed:`, error.message);
    throw new Error(`Database failure: ${error.message}`);
  }

  return {
    status: 'success',
    eventsIngested: rowsToInsert.length,
    date: date || 'today'
  };
}

// ============================================================================
// Express Routes
// ============================================================================

/**
 * POST /ingest
 * Accepts `{ "league": "mlb", "date": "20260601" }` in body, or via query params.
 */
app.all('/ingest', async (req, res) => {
  try {
    const league = req.body.league || req.query.league;
    const date = req.body.date || req.query.date;

    if (!league) {
      return res.status(400).json({ error: 'Missing required parameter: league' });
    }

    const result = await performIngestion(league, date);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Start server if this file is run directly
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.log(`[Worker] Ingestion worker listening on port ${PORT}`);
  });
}

// Export for use in seeder scripts
export {
  app,
  performIngestion
};
