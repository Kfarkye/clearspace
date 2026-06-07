import { Spanner } from '@google-cloud/spanner';
import fs from 'fs';
import path from 'path';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const INSTANCE = process.env.WC_SPANNER_INSTANCE || 'aura-governance-instance';
const DATABASE = process.env.WC_SPANNER_DATABASE || 'sports-db';

if (!PROJECT) {
  console.error('❌ GOOGLE_CLOUD_PROJECT environment variable is required.');
  process.exit(1);
}

const client = new Spanner({ projectId: PROJECT });
const db = client.instance(INSTANCE).database(DATABASE);

const CACHE_DIR = '/tmp/espn-cache/mlb';
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

interface MLBTeamInfo {
  code: string;
  espnId: string;
  espnAbbr: string;
}

function parseEspnSchedule(markdown: string, teamCode: string, espnAbbr: string): any[] {
  const lines = markdown.split('\n');
  const matches: any[] = [];
  const currentYear = new Date().getFullYear();

  // ESPN team abbreviation to database team code mapping
  const oppMap: Record<string, string> = {
    'ATH': 'OAK',
    'CHW': 'CWS',
  };

  for (const line of lines) {
    if (!line.includes('/gameId/')) continue;

    // Match date and venue indicator (e.g. "Thu, Mar 26@" or "Fri, Apr 3 vs")
    const dateMatch = line.match(/^([A-Za-z]+,\s*[A-Za-z]+\s*\d+)\s*(@|vs)/);
    if (!dateMatch) continue;

    const dateStr = dateMatch[1];
    const venueTypeRaw = dateMatch[2];
    const venueType = venueTypeRaw === '@' ? 'away' : 'home';

    const gameIdMatch = line.match(/\/gameId\/(\d+)/);
    if (!gameIdMatch) continue;
    const gameId = gameIdMatch[1];

    // Opponent abbreviation in ESPN link path: /name/([a-z]+)
    const teamMatch = line.match(/\/name\/([a-z]+)/);
    if (!teamMatch) continue;
    const oppAbbrRaw = teamMatch[1].toUpperCase();
    const opponentCode = oppMap[oppAbbrRaw] || oppAbbrRaw;

    // Result and Score: e.g. "W[7-0]" or "L[2-1]"
    const resultMatch = line.match(/\b(W|L)\[(\d+)-(\d+)\]/);
    if (!resultMatch) continue;
    const result = resultMatch[1];
    const score1 = parseInt(resultMatch[2], 10); // Winner score
    const score2 = parseInt(resultMatch[3], 10); // Loser score

    // Determine runs scored and runs allowed based on W/L result
    const goalsFor = result === 'W' ? score1 : score2;
    const goalsAgainst = result === 'W' ? score2 : score1;

    // Construct match date
    const cleanDateStr = dateStr.replace(/^[A-Za-z]+,\s*/, '');
    const matchDate = new Date(`${cleanDateStr}, ${currentYear}`);
    matchDate.setHours(12, 0, 0, 0); // Noon UTC buffer

    matches.push({
      match_id: `espn-mlb-${gameId}`,
      match_date: matchDate,
      competition: 'MLB Regular Season',
      opponent_code: opponentCode,
      venue_type: venueType,
      goals_for: goalsFor,
      goals_against: goalsAgainst,
      result: result,
      source_url: `https://www.espn.com/mlb/team/schedule/_/name/${espnAbbr.toLowerCase()}`,
      source_name: 'ESPN',
      fetched_at: new Date(),
    });
  }

  return matches;
}

function computeSnapshot(teamCode: string, matches: any[], period: string) {
  let subset = [...matches];
  // Since matches are parsed chronological (oldest first, newest last):
  if (period === 'last_10') subset = subset.slice(-10);
  else if (period === 'last_20') subset = subset.slice(-20);

  if (subset.length === 0) return null;

  const count = subset.length;
  let wins = 0;
  let losses = 0;
  let totalRunsFor = 0;
  let totalRunsAgainst = 0;
  let over85Count = 0;
  let rlCovers = 0; // Won by >= 2 or lost by 1 (naive run line logic)

  let homeWins = 0, homeLosses = 0;
  let awayWins = 0, awayLosses = 0;

  subset.forEach(m => {
    if (m.result === 'W') {
      wins++;
      if (m.venue_type === 'home') homeWins++;
      else awayWins++;
      if ((m.goals_for - m.goals_against) >= 2) rlCovers++;
    } else {
      losses++;
      if (m.venue_type === 'home') homeLosses++;
      else awayLosses++;
      if ((m.goals_against - m.goals_for) === 1) rlCovers++;
    }
    
    totalRunsFor += m.goals_for;
    totalRunsAgainst += m.goals_against;
    if ((m.goals_for + m.goals_against) > 8.5) over85Count++;
  });

  const last5 = matches.slice(-5);
  let l5w = 0, l5l = 0;
  last5.forEach(m => m.result === 'W' ? l5w++ : l5l++);

  const last10 = matches.slice(-10);
  let l10w = 0, l10l = 0;
  last10.forEach(m => m.result === 'W' ? l10w++ : l10l++);

  const runDifferential = totalRunsFor - totalRunsAgainst;

  return {
    league_id: 'MLB',
    team_code: teamCode,
    period,
    record: `${wins}-${losses}`,
    moneyline_win_pct: Spanner.numeric((wins / count).toFixed(4)),
    run_line_cover_pct: Spanner.numeric((rlCovers / count).toFixed(4)),
    over_pct: Spanner.numeric((over85Count / count).toFixed(4)),
    avg_runs_for: Spanner.numeric((totalRunsFor / count).toFixed(2)),
    avg_runs_against: Spanner.numeric((totalRunsAgainst / count).toFixed(2)),
    run_differential: Spanner.numeric(runDifferential.toFixed(1)),
    home_away_split: `Home: ${homeWins}-${homeLosses} | Away: ${awayWins}-${awayLosses}`,
    last_5_record: `${l5w}-${l5l}`,
    last_10_record: `${l10w}-${l10l}`,
    starter_era: null, // Placeholder for future pitching ingestion
    bullpen_era: null, // Placeholder for future pitching ingestion
    updated_at: Spanner.COMMIT_TIMESTAMP,
  };
}

async function run() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  console.log(`🏁 Starting MLB Historical matches ingestion against ${DATABASE}...`);

  // Query MLB teams from database to extract ESPN ID/slug mapping
  const [teamRows] = await db.run({
    sql: `SELECT team_code, provenance FROM teams WHERE league_id = 'MLB' AND COALESCE(is_placeholder, false) = false`
  });

  const teams: MLBTeamInfo[] = teamRows.map(r => {
    const row = r.toJSON();
    let espnId = '';
    let espnAbbr = '';
    if (row.provenance) {
      try {
        const prov = typeof row.provenance === 'string' ? JSON.parse(row.provenance) : row.provenance;
        espnId = prov.espn_team_id || '';
        espnAbbr = prov.espn_abbr || '';
      } catch (e: any) {
        console.warn(`Could not parse provenance for team ${row.team_code}: ${e.message}`);
      }
    }
    return {
      code: row.team_code,
      espnId,
      espnAbbr: espnAbbr || row.team_code
    };
  }).filter(t => t.espnId && t.espnAbbr);

  console.log(`Loaded ${teams.length} MLB teams with ESPN mapping.`);

  let targetTeams = teams.map(t => t.code);
  const teamArg = args.find(a => a.startsWith('--teams='));
  if (teamArg) {
    const list = teamArg.split('=')[1].split(',').map(t => t.trim().toUpperCase());
    targetTeams = targetTeams.filter(t => list.includes(t));
  }

  console.log(`Target Teams to ingest: ${targetTeams.join(', ')}\n`);

  for (const code of targetTeams) {
    const info = teams.find(t => t.code === code);
    if (!info) {
      console.warn(`⚠️ Team code ${code} not found in MLB mappings. Skipping.`);
      continue;
    }

    const cacheFile = path.join(CACHE_DIR, `${code}.md`);
    let markdown = '';

    if (fs.existsSync(cacheFile) && !force) {
      console.log(`📦 [Cache] Reading ${code} historical results...`);
      markdown = fs.readFileSync(cacheFile, 'utf8');
    } else {
      console.log(`🌐 [Fetch] Fetching ESPN results for ${code} (ID: ${info.espnId}, Abbr: ${info.espnAbbr})...`);
      const url = `https://r.jina.ai/https://www.espn.com/mlb/team/schedule/_/name/${info.espnAbbr.toLowerCase()}`;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        markdown = await res.text();
        fs.writeFileSync(cacheFile, markdown, 'utf8');
        // Wait 1.5s to respect rate limits if fetching live
        await new Promise(r => setTimeout(r, 1500));
      } catch (err: any) {
        console.error(`❌ Failed to fetch results for ${code}: ${err.message}`);
        continue;
      }
    }

    const parsedMatches = parseEspnSchedule(markdown, code, info.espnAbbr);
    console.log(`   Parsed ${parsedMatches.length} completed matches for ${code}.`);

    if (parsedMatches.length === 0) continue;

    // 1. Batch upsert historical matches
    console.log(`   Upserting ${parsedMatches.length} historical matches for ${code} to Spanner...`);
    const rows = parsedMatches.map(m => ({
      league_id: 'MLB',
      team_code: code,
      match_id: m.match_id,
      match_date: m.match_date,
      competition: m.competition,
      opponent_code: m.opponent_code,
      venue_type: m.venue_type,
      goals_for: m.goals_for,
      goals_against: m.goals_against,
      result: m.result,
      source_url: m.source_url,
      source_name: 'ESPN',
      fetched_at: m.fetched_at,
      created_at: Spanner.COMMIT_TIMESTAMP,
    }));

    try {
      await db.table('historical_matches').upsert(rows);
    } catch (err: any) {
      console.error(`❌ Failed to upsert historical matches for ${code}: ${err.message}`);
      continue;
    }

    // 2. Compute and upsert derived trends/snapshots
    console.log(`   Computing derived trends for ${code}...`);
    const snapshots: any[] = [];
    ['last_10', 'last_20', 'all'].forEach(period => {
      const snap = computeSnapshot(code, parsedMatches, period);
      if (snap) snapshots.push(snap);
    });

    if (snapshots.length > 0) {
      try {
        await db.table('mlb_team_snapshots').upsert(snapshots);
        console.log(`   ✓ Snapshots updated.`);
      } catch (err: any) {
        console.error(`❌ Failed to upsert snapshots for ${code}: ${err.message}`);
      }
    }
  }

  console.log('\n🎉 MLB Ingestion Run Finished successfully.');
  await db.close();
  process.exit(0);
}

run();
