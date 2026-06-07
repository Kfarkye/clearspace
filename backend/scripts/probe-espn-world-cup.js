/**
 * @fileoverview Phase 1: ESPN World Cup Payload Probe
 * @description Strictly fetches and saves raw ESPN API payloads without mutation.
 * Generates a schema inventory for deterministic mapping. No synthetic data.
 */

import { promises as fs } from 'fs';
import path from 'path';

const ENDPOINTS = {
  SCOREBOARD: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard',
  TEAMS: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams'
};

const OUT_DIR = path.resolve(process.cwd(), 'samples/espn');

const FILES = {
  SCOREBOARD: path.join(OUT_DIR, 'worldcup_scoreboard_raw.json'),
  TEAMS: path.join(OUT_DIR, 'worldcup_teams_raw.json'),
  ROSTERS: path.join(OUT_DIR, 'worldcup_rosters_raw.jsonl'),
  SUMMARIES: path.join(OUT_DIR, 'worldcup_event_summaries_raw.jsonl'),
  INVENTORY: path.join(OUT_DIR, 'worldcup_schema_inventory.json')
};

// Utility: Delay to prevent rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson(url) {
  console.log(`[PROBE] Fetching: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.json();
}

async function init() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  // Clear append-only files
  await fs.writeFile(FILES.ROSTERS, '');
  await fs.writeFile(FILES.SUMMARIES, '');
}

async function runProbe() {
  await init();
  console.log('[AURA] Initiating strict ESPN payload probe...');

  const inventory = {
    metadata: { probed_at: new Date().toISOString(), target: "fifa.world" },
    schema_paths: {
      teams: {},
      players: {},
      injuries: {},
      matches: {},
      odds: {}
    }
  };

  try {
    // 1. Probe Scoreboard
    const scoreboard = await fetchJson(ENDPOINTS.SCOREBOARD);
    await fs.writeFile(FILES.SCOREBOARD, JSON.stringify(scoreboard, null, 2));
    
    // 2. Probe Teams
    const teamsData = await fetchJson(ENDPOINTS.TEAMS);
    await fs.writeFile(FILES.TEAMS, JSON.stringify(teamsData, null, 2));

    // 3. Extract & Probe Rosters
    const teamsList = teamsData.sports?.[0]?.leagues?.[0]?.teams || [];
    for (const t of teamsList) {
      const rosterLink = t.team?.links?.find(l => l.rel?.includes('roster'));
      if (rosterLink && rosterLink.href) {
        try {
          const roster = await fetchJson(rosterLink.href);
          await fs.appendFile(FILES.ROSTERS, JSON.stringify({ team_id: t.team.id, url: rosterLink.href, payload: roster }) + '\n');
          await sleep(200); // Rate limit protection
        } catch (e) {
          console.warn(`[WARN] Failed to fetch roster for ${t.team.id}: ${e.message}`);
        }
      }
    }

    // 4. Extract & Probe Event Summaries
    const eventsList = scoreboard.events || [];
    for (const e of eventsList) {
      const summaryLink = e.links?.find(l => l.rel?.includes('summary'));
      if (summaryLink && summaryLink.href) {
        try {
          const summary = await fetchJson(summaryLink.href);
          await fs.appendFile(FILES.SUMMARIES, JSON.stringify({ event_id: e.id, url: summaryLink.href, payload: summary }) + '\n');
          await sleep(200);
        } catch (err) {
          console.warn(`[WARN] Failed to fetch summary for ${e.id}: ${err.message}`);
        }
      }
    }

    // 5. Build Schema Inventory (Mapping physical paths based on standard ESPN structures)
    inventory.schema_paths.teams = {
      team_id: "sports[0].leagues[0].teams[].team.id",
      abbreviation: "sports[0].leagues[0].teams[].team.abbreviation",
      display_name: "sports[0].leagues[0].teams[].team.displayName",
      logo_url: "sports[0].leagues[0].teams[].team.logos[0].href",
      source_url: ENDPOINTS.TEAMS
    };

    inventory.schema_paths.matches = {
      event_id: "events[].id",
      match_date: "events[].date",
      home_team: "events[].competitions[0].competitors[?(@.homeAway=='home')].team.id",
      away_team: "events[].competitions[0].competitors[?(@.homeAway=='away')].team.id",
      venue: "events[].competitions[0].venue.fullName",
      status: "events[].status.type.name",
      source_url: ENDPOINTS.SCOREBOARD
    };

    inventory.schema_paths.odds = {
      provider: "events[].competitions[0].odds[].provider.name",
      details: "events[].competitions[0].odds[].details",
      overUnder: "events[].competitions[0].odds[].overUnder",
      source_url: ENDPOINTS.SCOREBOARD
    };

    // Note: Players and Injuries paths will be verified manually from the JSONL outputs
    inventory.schema_paths.players = "PENDING_MANUAL_VERIFICATION_FROM_ROSTERS_JSONL";
    inventory.schema_paths.injuries = "PENDING_MANUAL_VERIFICATION_FROM_ROSTERS_OR_SUMMARIES";

    await fs.writeFile(FILES.INVENTORY, JSON.stringify(inventory, null, 2));
    console.log(`\n[SUCCESS] Probe complete. Artifacts saved to ${OUT_DIR}`);
    console.log(`[ACTION REQUIRED] Inspect ${FILES.INVENTORY} and the raw JSON files before proceeding to Phase 3.`);

  } catch (error) {
    console.error('[FATAL] Probe failed:', error);
    process.exit(1);
  }
}

runProbe();
