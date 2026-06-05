/**
 * @file espn-historical.ts
 * @description Ingestion pipeline for ESPN historical soccer match results via Jina proxy.
 * Computes form snapshots and upserts data into Cloud Spanner.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { Spanner } from '@google-cloud/spanner';

// --- Interfaces & Types ---

interface Match {
  league_id: string;
  team_code: string;
  match_id: string;
  match_date: Date;
  competition: string;
  opponent_code: string;
  venue_type: 'home' | 'away' | 'neutral';
  goals_for: number;
  goals_against: number;
  result: 'W' | 'L' | 'D';
  source_url: string;
  source_name: string;
  fetched_at: Date;
}

interface Snapshot {
  league_id: string;
  team_code: string;
  period: string;
  fifa_rank: number | null;
  elo_rating: number | null;
  form_5: string;
  form_10: string;
  goals_for_avg: any; // Spanner.numeric
  goals_against_avg: any;
  clean_sheet_rate: any;
  over_2_5_rate: any;
  btts_rate: any;
  win_rate: any;
}

// --- Configuration ---

const CACHE_DIR = '/tmp/espn-cache';
const JINA_BASE_URL = 'https://r.jina.ai/https://www.espn.com/soccer/team/results/_/id';
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
const INSTANCE_ID = process.env.WC_SPANNER_INSTANCE || 'aura-governance-instance';
const DATABASE_ID = process.env.WC_SPANNER_DATABASE || 'world-cup-db';
const LEAGUE_ID = 'WORLD_CUP';

if (!PROJECT_ID) {
  console.error('❌ GOOGLE_CLOUD_PROJECT environment variable is required.');
  process.exit(1);
}

// Canonical mapping of qualified teams to ESPN IDs and slugs
const ESPN_TEAM_MAP: Record<string, { id: string; slug: string }> = {
  ALG: { id: "624", slug: "alg" },
  ARG: { id: "202", slug: "arg" },
  AUS: { id: "628", slug: "aus" },
  AUT: { id: "474", slug: "aut" },
  BEL: { id: "459", slug: "bel" },
  BIH: { id: "452", slug: "bih" },
  BRA: { id: "205", slug: "bra" },
  CAN: { id: "206", slug: "can" },
  CPV: { id: "2597", slug: "cpv" },
  COL: { id: "208", slug: "col" },
  COD: { id: "2850", slug: "rdc" },
  CRO: { id: "477", slug: "cro" },
  CZE: { id: "450", slug: "cze" },
  ECU: { id: "209", slug: "ecu" },
  EGY: { id: "2620", slug: "egy" },
  ENG: { id: "448", slug: "eng" },
  FRA: { id: "478", slug: "fra" },
  GER: { id: "481", slug: "ger" },
  GHA: { id: "4469", slug: "gha" },
  HAI: { id: "2654", slug: "hai" },
  IRN: { id: "469", slug: "irn" },
  IRQ: { id: "4375", slug: "irq" },
  CIV: { id: "4789", slug: "civ" },
  JPN: { id: "627", slug: "jpn" },
  JOR: { id: "2917", slug: "jor" },
  MEX: { id: "203", slug: "mex" },
  MAR: { id: "2869", slug: "mar" },
  NED: { id: "449", slug: "ned" },
  NZL: { id: "2666", slug: "nzl" },
  NOR: { id: "464", slug: "nor" },
  PAN: { id: "2659", slug: "pan" },
  PAR: { id: "210", slug: "par" },
  POR: { id: "482", slug: "por" },
  QAT: { id: "4398", slug: "qat" },
  KSA: { id: "655", slug: "ksa" },
  SCO: { id: "580", slug: "sco" },
  SEN: { id: "654", slug: "sen" },
  RSA: { id: "467", slug: "rsa" },
  KOR: { id: "451", slug: "kors" },
  ESP: { id: "164", slug: "esp" },
  SWE: { id: "466", slug: "swe" },
  SUI: { id: "475", slug: "sui" },
  TUN: { id: "659", slug: "tun" },
  TUR: { id: "465", slug: "tur" },
  USA: { id: "660", slug: "usa" },
  URU: { id: "212", slug: "uru" },
  UZB: { id: "2570", slug: "uzb" },
  CUR: { id: "11678", slug: "fifa" }
};

const ESPN_ID_TO_CODE: Record<string, string> = {};
for (const [code, info] of Object.entries(ESPN_TEAM_MAP)) {
  ESPN_ID_TO_CODE[info.id] = code;
}

// --- Storage Initialization ---

const spanner = new Spanner({ projectId: PROJECT_ID });
const instance = spanner.instance(INSTANCE_ID);
const database = instance.database(DATABASE_ID);

// --- Core Pipeline Logic ---

/**
 * Ensures the local cache directory exists.
 */
async function initCache(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create cache directory:', error);
    process.exit(1);
  }
}

/**
 * Fetches match data via Jina, caching the raw output locally to respect rate limits.
 */
async function fetchWithCache(teamCode: string, espnId: string, slug: string, force: boolean): Promise<string> {
  const cachePath = path.join(CACHE_DIR, `${teamCode}_results.md`);
  
  if (!force) {
    try {
      const cachedData = await fs.readFile(cachePath, 'utf-8');
      if (cachedData.length >= 500) {
        console.log(`📦 [Cache] Reading ${teamCode} historical results...`);
        return cachedData;
      }
      console.log(`⚠️ [Cache] Cached data for ${teamCode} was too short (${cachedData.length} chars). Re-fetching...`);
    } catch {
      // Ignore and fetch
    }
  }

  console.log(`🌐 [Fetch] Fetching ESPN results for ${teamCode} (ID: ${espnId}, Slug: ${slug}) via Jina...`);
  const targetUrl = `${JINA_BASE_URL}/${espnId}/${slug}`;
  
  const response = await fetch(targetUrl, {
    headers: {
      'Accept': 'text/plain',
      'X-Return-Format': 'markdown'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${teamCode}: ${response.statusText}`);
  }

  const data = await response.text();
  if (data.length < 500) {
    throw new Error(`Fetched markdown for ${teamCode} is too short (${data.length} characters). Jina proxy may have returned an empty response.`);
  }

  await fs.writeFile(cachePath, data, 'utf-8');
  
  // Naive rate limiting
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return data;
}

/**
 * Parses Jina Markdown output into structured Match records.
 */
function parseMatches(rawContent: string, teamCode: string, espnId: string): Match[] {
  const matches: Match[] = [];
  const lines = rawContent.split('\n');
  const sourceUrl = `https://www.espn.com/soccer/team/results/_/id/${espnId}`;

  // Default to current year if no header is found immediately
  let currentYear = new Date().getFullYear();

  for (const line of lines) {
    // Detect year headers in markdown (e.g., "# 2023" or "### 2022" or "November, 2025")
    const yearHeaderMatch = line.match(/^#+\s*(20\d{2})\s*$/) || line.match(/^([A-Za-z]+),\s*(\d{4})\s*$/);
    if (yearHeaderMatch) {
      currentYear = parseInt(yearHeaderMatch[yearHeaderMatch.length - 1], 10);
      continue;
    }

    // Parse Markdown table rows starting and ending with |
    if (line.startsWith('|') && !line.includes('---') && !line.includes('DATE | MATCH')) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 6) {
        const dateStr = parts[1];
        const team1Str = parts[2];
        const resultStr = parts[3];
        const team2Str = parts[4];
        const competition = parts[6] || 'Unknown';

        // Extract score and game ID
        const scoreMatch = resultStr.match(/\[(\d+)\s*-\s*(\d+)\]/);
        const gameIdMatch = resultStr.match(/\/gameId\/(\d+)/);

        if (scoreMatch && gameIdMatch) {
          const score1 = parseInt(scoreMatch[1], 10);
          const score2 = parseInt(scoreMatch[2], 10);
          const gameId = gameIdMatch[1];

          // Extract team IDs from links
          const t1IdMatch = team1Str.match(/\/id\/(\d+)/);
          const t2IdMatch = team2Str.match(/\/id\/(\d+)/);

          if (t1IdMatch && t2IdMatch) {
            const t1Id = t1IdMatch[1];
            const t2Id = t2IdMatch[1];

            // Determine if teamCode is team1
            const isTeam1 = t1Id === espnId;
            const oppId = isTeam1 ? t2Id : t1Id;

            const oppStr = isTeam1 ? team2Str : team1Str;
            const oppSlugMatch = oppStr.match(/\/id\/\d+\/([a-z-]+)/);
            const oppSlug = oppSlugMatch ? oppSlugMatch[1] : 'unknown';

            const opponentCode = ESPN_ID_TO_CODE[oppId] || oppSlug.substring(0, 3).toUpperCase();
            const venueType = isTeam1 ? 'home' : 'away';

            const goalsFor = isTeam1 ? score1 : score2;
            const goalsAgainst = isTeam1 ? score2 : score1;

            let result: 'W' | 'L' | 'D' = 'D';
            if (goalsFor > goalsAgainst) result = 'W';
            else if (goalsFor < goalsAgainst) result = 'L';

            const cleanDateStr = dateStr.replace(/^[A-Za-z]+,\s*/, ''); // strip day of week, e.g. "Sun, "
            const matchDate = new Date(`${cleanDateStr} ${currentYear}`);
            matchDate.setHours(12, 0, 0, 0);

            const matchHash = crypto.createHash('sha256')
              .update(`${teamCode}-${matchDate.toISOString()}-${opponentCode}-${competition}`)
              .digest('hex')
              .substring(0, 32);

            matches.push({
              league_id: LEAGUE_ID,
              team_code: teamCode,
              match_id: matchHash,
              match_date: matchDate,
              competition: competition.trim(),
              opponent_code: opponentCode,
              venue_type: venueType,
              goals_for: goalsFor,
              goals_against: goalsAgainst,
              result,
              source_url: sourceUrl,
              source_name: 'ESPN',
              fetched_at: new Date()
            });
          }
        }
      }
    }
  }

  // Return sorted descending by date
  return matches.sort((a, b) => b.match_date.getTime() - a.match_date.getTime());
}

/**
 * Computes derived statistical snapshots over a specific subset of matches.
 */
function computeSnapshot(matches: Match[], teamCode: string, period: string, count: number): Snapshot {
  const subset = matches.slice(0, count);
  const total = subset.length;

  if (total === 0) {
    return {
      league_id: LEAGUE_ID,
      team_code: teamCode,
      period,
      fifa_rank: null,
      elo_rating: null,
      form_5: '',
      form_10: '',
      goals_for_avg: Spanner.numeric('0'),
      goals_against_avg: Spanner.numeric('0'),
      clean_sheet_rate: Spanner.numeric('0'),
      over_2_5_rate: Spanner.numeric('0'),
      btts_rate: Spanner.numeric('0'),
      win_rate: Spanner.numeric('0')
    };
  }

  const goalsFor = subset.reduce((acc, m) => acc + m.goals_for, 0);
  const goalsAgainst = subset.reduce((acc, m) => acc + m.goals_against, 0);
  const cleanSheets = subset.filter(m => m.goals_against === 0).length;
  const overs = subset.filter(m => (m.goals_for + m.goals_against) > 2.5).length;
  const btts = subset.filter(m => m.goals_for > 0 && m.goals_against > 0).length;
  const wins = subset.filter(m => m.result === 'W').length;
  
  const form5 = subset.slice(0, 5).map(m => m.result).reverse().join('');
  const form10 = subset.slice(0, 10).map(m => m.result).reverse().join('');

  return {
    league_id: LEAGUE_ID,
    team_code: teamCode,
    period,
    fifa_rank: null,
    elo_rating: null,
    form_5: form5,
    form_10: form10,
    goals_for_avg: Spanner.numeric((goalsFor / total).toFixed(2)),
    goals_against_avg: Spanner.numeric((goalsAgainst / total).toFixed(2)),
    clean_sheet_rate: Spanner.numeric((cleanSheets / total).toFixed(4)),
    over_2_5_rate: Spanner.numeric((overs / total).toFixed(4)),
    btts_rate: Spanner.numeric((btts / total).toFixed(4)),
    win_rate: Spanner.numeric((wins / total).toFixed(4))
  };
}

/**
 * Upserts matches and computed snapshots into Spanner in a transaction.
 */
async function saveToSpanner(matches: Match[], snapshots: Snapshot[]): Promise<void> {
  try {
    await database.runTransactionAsync(async (transaction) => {
      const matchRows = matches.map(m => ({
        league_id: m.league_id,
        team_code: m.team_code,
        match_id: m.match_id,
        match_date: m.match_date,
        competition: m.competition,
        opponent_code: m.opponent_code,
        venue_type: m.venue_type,
        goals_for: m.goals_for,
        goals_against: m.goals_against,
        result: m.result,
        source_url: m.source_url,
        source_name: m.source_name,
        fetched_at: m.fetched_at,
        created_at: Spanner.COMMIT_TIMESTAMP
      }));

      const snapshotRows = snapshots.map(s => ({
        league_id: s.league_id,
        team_code: s.team_code,
        period: s.period,
        fifa_rank: s.fifa_rank,
        elo_rating: s.elo_rating,
        form_5: s.form_5,
        form_10: s.form_10,
        goals_for_avg: s.goals_for_avg,
        goals_against_avg: s.goals_against_avg,
        clean_sheet_rate: s.clean_sheet_rate,
        over_2_5_rate: s.over_2_5_rate,
        btts_rate: s.btts_rate,
        win_rate: s.win_rate,
        updated_at: Spanner.COMMIT_TIMESTAMP
      }));

      transaction.upsert('historical_matches', matchRows);
      transaction.upsert('team_historical_snapshots', snapshotRows);
      
      await transaction.commit();
      console.log(`[SPANNER] Upserted ${matches.length} matches and ${snapshots.length} snapshots.`);
    });
  } catch (error) {
    console.error('[SPANNER ERROR] Failed to commit transaction:', error);
    throw error;
  }
}

/**
 * Main execution handler.
 */
async function main() {
  await initCache();

  // Parse command line args for specific teams
  const args = process.argv.slice(2);
  const teamsArg = args.find(a => a.startsWith('--teams='));
  const force = args.includes('--force');

  const targetTeams = teamsArg 
    ? teamsArg.split('=')[1].split(',').map(t => t.trim().toUpperCase())
    : Object.keys(ESPN_TEAM_MAP);

  console.log(`🏁 Starting ESPN Historical matches ingestion...`);
  console.log(`   Target Teams: ${targetTeams.join(', ')}\n`);

  for (const teamCode of targetTeams) {
    const info = ESPN_TEAM_MAP[teamCode];
    if (!info) {
      console.warn(`[WARN] No ESPN info mapped for team code: ${teamCode}`);
      continue;
    }

    try {
      const rawContent = await fetchWithCache(teamCode, info.id, info.slug, force);
      const matches = parseMatches(rawContent, teamCode, info.id);
      
      if (matches.length > 0) {
        const snapshots = [
          computeSnapshot(matches, teamCode, 'last_10', 10),
          computeSnapshot(matches, teamCode, 'last_20', 20),
          computeSnapshot(matches, teamCode, 'all', matches.length)
        ];

        await saveToSpanner(matches, snapshots);
        console.log(`[SUCCESS] Processed ${teamCode}`);
      } else {
        console.log(`[INFO] No matches parsed for ${teamCode}. Check DOM structure.`);
      }

    } catch (error) {
      console.error(`[ERROR] Failed processing ${teamCode}:`, error);
    }
  }

  // Cleanup Spanner instance and client connections
  await database.close();
  spanner.close();
  console.log('\n🎉 ESPN Ingestion Run Finished successfully.');
}

main().catch(console.error);
