// pipeline module: fetch.ts
import * as fs from 'fs';
import * as path from 'path';

import { fetchRawData as fetchFifaSchedule } from '../sources/fifa-schedule.js';
import { fetchRawData as fetchTheDripTeamProfiles } from '../sources/thedrip-team-profiles.js';
import { fetchRawData as fetchEspnLogos } from '../sources/espn-team-logos.js';
import { fetchRawData as fetchVenues } from '../sources/venues.js';
import { fetchRawData as fetchOdds } from '../sources/odds-futures.js';
import { fetchRawData as fetchLiveApi } from '../sources/live-api.js';

const CACHE_DIR = '/tmp/worldcup-ingest-cache';

export interface RawDataPayload {
  fifaSchedule: string;
  thedripTeamProfiles: string;
  espnTeamLogos: string;
  venues: string;
  oddsFutures: string;
  liveApi: string;
}

export async function executeFetch(): Promise<RawDataPayload> {
  console.log('🔄 [Pipeline: Fetch] Initiating raw data ingestion...');

  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  // 1. Fetch FIFA Schedule
  console.log('  -> Fetching FIFA Schedule canonical backbone...');
  const fifaSchedule = await fetchFifaSchedule();
  fs.writeFileSync(path.join(CACHE_DIR, 'fifa-schedule.raw.json'), fifaSchedule);

  // 2. Fetch TheDrip team profiles (we can pass USA and BRA to test real scraping, rest simulated)
  console.log('  -> Fetching/Simulating TheDrip team profiles...');
  const thedripTeamProfiles = await fetchTheDripTeamProfiles(['USA', 'BRA']);
  fs.writeFileSync(path.join(CACHE_DIR, 'thedrip-team-profiles.raw.json'), thedripTeamProfiles);

  // 3. Fetch ESPN logos
  console.log('  -> Fetching ESPN CDN Logo mappings...');
  const espnTeamLogos = await fetchEspnLogos();
  fs.writeFileSync(path.join(CACHE_DIR, 'espn-team-logos.raw.json'), espnTeamLogos);

  // 4. Fetch Venues
  console.log('  -> Fetching venue dimensions and specs...');
  const venues = await fetchVenues();
  fs.writeFileSync(path.join(CACHE_DIR, 'venues.raw.json'), venues);

  // 5. Fetch Odds Futures
  console.log('  -> Fetching Outright Odds snapshot...');
  const oddsFutures = await fetchOdds();
  fs.writeFileSync(path.join(CACHE_DIR, 'odds-futures.raw.json'), oddsFutures);

  // 6. Fetch Live API
  console.log('  -> Fetching live scoreboard events...');
  const liveApi = await fetchLiveApi();
  fs.writeFileSync(path.join(CACHE_DIR, 'live-api.raw.json'), liveApi);

  console.log(`✅ [Pipeline: Fetch] Complete. Cache written to ${CACHE_DIR}`);

  return {
    fifaSchedule,
    thedripTeamProfiles,
    espnTeamLogos,
    venues,
    oddsFutures,
    liveApi,
  };
}
