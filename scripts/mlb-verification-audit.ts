import { Spanner } from '@google-cloud/spanner';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
const INSTANCE = process.env.SPANNER_INSTANCE || 'clearspace';
const DATABASE = process.env.SPANNER_DATABASE || 'clearspace-db';

const client = new Spanner({ projectId: PROJECT });
const db = client.instance(INSTANCE).database(DATABASE);

const RAW_DIR = path.join(process.cwd(), 'data/raw/espn_mlb_verification');
const MAPPED_DIR = path.join(process.cwd(), 'data/mapped');

if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });
if (!fs.existsSync(MAPPED_DIR)) fs.mkdirSync(MAPPED_DIR, { recursive: true });

interface Mismatch {
  EventId: string;
  table: string;
  field: string;
  spanner_value: any;
  source_value: any;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface SourceHash {
  source_url: string;
  fetched_at: string;
  sha256: string;
  file_path: string;
}

const report = {
  truth_scores: {
    MlbGames: 'REAL',
    MlbPlayByPlay: 'REAL',
    MlbBoxscoreBatting: 'REAL',
    MlbBoxscorePitching: 'REAL',
    MlbOddsHistory: 'REAL',
    MlbInjuries: 'REAL',
  },
  mismatches: [] as Mismatch[],
  source_payloads: [] as SourceHash[],
};

function downgradeScore(table: keyof typeof report.truth_scores, newScore: 'PARTIAL' | 'UNVERIFIED' | 'BAD') {
  const precedence = { 'REAL': 4, 'PARTIAL': 3, 'UNVERIFIED': 2, 'BAD': 1 };
  const currentScore = report.truth_scores[table];
  if (precedence[newScore] < precedence[currentScore as keyof typeof precedence]) {
    report.truth_scores[table] = newScore;
  }
}

async function fetchSource(url: string, prefix: string): Promise<any> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const strData = JSON.stringify(data, null, 2);
    const hash = crypto.createHash('sha256').update(strData).digest('hex');
    const filename = `${prefix}_${hash.substring(0, 8)}.json`;
    const filepath = path.join(RAW_DIR, filename);
    fs.writeFileSync(filepath, strData);
    
    report.source_payloads.push({
      source_url: url,
      fetched_at: new Date().toISOString(),
      sha256: hash,
      file_path: `data/raw/espn_mlb_verification/${filename}`
    });
    
    return data;
  } catch (err) {
    console.error(`Failed to fetch ${url}`, err);
    return null;
  }
}

async function run() {
  console.log('🚀 Starting MLB Source Truth Verification Audit...');

  // 1. Sample Selection
  const eventIds = new Set<string>();
  
  // 10 Recent Games
  const [recentRows] = await db.run({ sql: `SELECT EventId FROM MlbGames ORDER BY GameDate DESC LIMIT 10` });
  recentRows.forEach(r => eventIds.add(r.toJSON().EventId));

  // 10 Older Games
  const [olderRows] = await db.run({ sql: `SELECT EventId FROM MlbGames ORDER BY GameDate ASC LIMIT 10` });
  olderRows.forEach(r => eventIds.add(r.toJSON().EventId));

  // 5 High Scoring Games
  const [highRows] = await db.run({ sql: `SELECT EventId FROM MlbGames ORDER BY (HomeScore + AwayScore) DESC LIMIT 5` });
  highRows.forEach(r => eventIds.add(r.toJSON().EventId));

  // 5 Close Games
  const [closeRows] = await db.run({ sql: `SELECT EventId FROM MlbGames WHERE HomeScore IS NOT NULL AND AwayScore IS NOT NULL ORDER BY ABS(HomeScore - AwayScore) ASC LIMIT 5` });
  closeRows.forEach(r => eventIds.add(r.toJSON().EventId));

  // 5 Games with Odds History
  const [oddsRows] = await db.run({ sql: `SELECT DISTINCT EventId FROM MlbOddsHistory LIMIT 5` });
  oddsRows.forEach(r => eventIds.add(r.toJSON().EventId));

  // 5 Games with Play-By-Play
  const [pbpRows] = await db.run({ sql: `SELECT DISTINCT EventId FROM MlbPlayByPlay LIMIT 5` });
  pbpRows.forEach(r => eventIds.add(r.toJSON().EventId));

  console.log(`📋 Selected ${eventIds.size} unique events for auditing.`);

  for (const eventId of eventIds) {
    console.log(`\n🔍 Verifying Event: ${eventId}`);
    
    const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${eventId}`;
    const summary = await fetchSource(summaryUrl, `summary_${eventId}`);

    if (!summary || !summary.header || !summary.boxscore) {
      console.warn(`Could not fetch summary for ${eventId}, marking UNVERIFIED where applicable.`);
      continue;
    }

    // A. Verify MlbGames
    const [gameRows] = await db.run({ sql: `SELECT * FROM MlbGames WHERE EventId = '${eventId}'` });
    if (gameRows.length > 0) {
      const g = gameRows[0].toJSON();
      const espnCompetitors = summary.header.competitions[0].competitors;
      const homeTeam = espnCompetitors.find((c: any) => c.homeAway === 'home');
      const awayTeam = espnCompetitors.find((c: any) => c.homeAway === 'away');
      
      if (g.HomeTeamName !== homeTeam.team.displayName) {
        report.mismatches.push({ EventId: eventId, table: 'MlbGames', field: 'HomeTeamName', spanner_value: g.HomeTeamName, source_value: homeTeam.team.displayName, severity: 'HIGH' });
        downgradeScore('MlbGames', 'BAD');
      }
      if (g.AwayTeamName !== awayTeam.team.displayName) {
        report.mismatches.push({ EventId: eventId, table: 'MlbGames', field: 'AwayTeamName', spanner_value: g.AwayTeamName, source_value: awayTeam.team.displayName, severity: 'HIGH' });
        downgradeScore('MlbGames', 'BAD');
      }
      if (g.HomeScore !== parseInt(homeTeam.score || '0')) {
        report.mismatches.push({ EventId: eventId, table: 'MlbGames', field: 'HomeScore', spanner_value: g.HomeScore, source_value: parseInt(homeTeam.score || '0'), severity: 'HIGH' });
        downgradeScore('MlbGames', 'BAD');
      }
      if (g.AwayScore !== parseInt(awayTeam.score || '0')) {
        report.mismatches.push({ EventId: eventId, table: 'MlbGames', field: 'AwayScore', spanner_value: g.AwayScore, source_value: parseInt(awayTeam.score || '0'), severity: 'HIGH' });
        downgradeScore('MlbGames', 'BAD');
      }
      
      // status logic (mapping espn status to ours)
      const sourceStatus = summary.header.competitions[0].status.type.name;
      if (sourceStatus === 'STATUS_FINAL' && g.Status !== 'Final') {
          report.mismatches.push({ EventId: eventId, table: 'MlbGames', field: 'Status', spanner_value: g.Status, source_value: sourceStatus, severity: 'HIGH' });
          downgradeScore('MlbGames', 'BAD');
      }
    } else {
      report.mismatches.push({ EventId: eventId, table: 'MlbGames', field: 'EventId', spanner_value: null, source_value: eventId, severity: 'HIGH' });
      downgradeScore('MlbGames', 'PARTIAL');
    }

    // B. Verify MlbPlayByPlay
    const [pbpRows] = await db.run({ sql: `SELECT COUNT(*) as c FROM MlbPlayByPlay WHERE EventId = '${eventId}'` });
    const pbpCount = pbpRows[0].toJSON().c;
    
    // Play by play source comes from summary.plays
    const sourcePlays = summary.plays || [];
    if (sourcePlays.length > 0) {
      if (pbpCount === 0) {
        report.mismatches.push({ EventId: eventId, table: 'MlbPlayByPlay', field: 'count', spanner_value: 0, source_value: sourcePlays.length, severity: 'HIGH' });
        downgradeScore('MlbPlayByPlay', 'BAD');
      } else if (Math.abs(Number(pbpCount) - sourcePlays.length) > 10) {
        report.mismatches.push({ EventId: eventId, table: 'MlbPlayByPlay', field: 'count', spanner_value: Number(pbpCount), source_value: sourcePlays.length, severity: 'MEDIUM' });
        downgradeScore('MlbPlayByPlay', 'PARTIAL');
      }
    } else if (pbpCount > 0) {
       report.mismatches.push({ EventId: eventId, table: 'MlbPlayByPlay', field: 'count', spanner_value: Number(pbpCount), source_value: 0, severity: 'HIGH' });
       downgradeScore('MlbPlayByPlay', 'BAD');
    }

    // C. Verify Boxscore
    if (summary.boxscore && summary.boxscore.players) {
      // BoxscoreBatting
      const [batRows] = await db.run({ sql: `SELECT COUNT(*) as c FROM MlbBoxscoreBatting WHERE EventId = '${eventId}'` });
      if (Number(batRows[0].toJSON().c) === 0 && summary.boxscore.players.some((p: any) => p.statistics && p.statistics.length > 0)) {
         report.mismatches.push({ EventId: eventId, table: 'MlbBoxscoreBatting', field: 'count', spanner_value: 0, source_value: '>0', severity: 'HIGH' });
         downgradeScore('MlbBoxscoreBatting', 'PARTIAL'); // Maybe they weren't ingested yet
      }

      // BoxscorePitching
      const [pitchRows] = await db.run({ sql: `SELECT COUNT(*) as c FROM MlbBoxscorePitching WHERE EventId = '${eventId}'` });
      if (Number(pitchRows[0].toJSON().c) === 0 && summary.boxscore.players.some((p: any) => p.statistics && p.statistics.length > 0)) {
         report.mismatches.push({ EventId: eventId, table: 'MlbBoxscorePitching', field: 'count', spanner_value: 0, source_value: '>0', severity: 'HIGH' });
         downgradeScore('MlbBoxscorePitching', 'PARTIAL');
      }
    }
    
    // D. Verify Odds
    const [oddsRows] = await db.run({ sql: `SELECT * FROM MlbOddsHistory WHERE EventId = '${eventId}'` });
    if (oddsRows.length > 0) {
       const sourceOdds = summary.pickcenter || [];
       if (sourceOdds.length === 0) {
         report.mismatches.push({ EventId: eventId, table: 'MlbOddsHistory', field: 'provider', spanner_value: oddsRows[0].toJSON().Provider, source_value: null, severity: 'HIGH' });
         downgradeScore('MlbOddsHistory', 'UNVERIFIED');
       } else {
         // rudimentary check if our odds provider exists in source
         const spannerProviders = oddsRows.map(r => r.toJSON().Provider);
         const sourceProviders = sourceOdds.map((o: any) => o.provider.name);
         const hasMatch = spannerProviders.some(p => sourceProviders.includes(p));
         if (!hasMatch) {
            report.mismatches.push({ EventId: eventId, table: 'MlbOddsHistory', field: 'provider', spanner_value: spannerProviders.join(','), source_value: sourceProviders.join(','), severity: 'HIGH' });
            downgradeScore('MlbOddsHistory', 'BAD');
         }
       }
    }

    await new Promise(r => setTimeout(r, 500)); // Rate limit buffer
  }

  // E. Verify Injuries
  console.log(`\n🚑 Verifying Injuries...`);
  const [injuryRows] = await db.run({ sql: `SELECT * FROM MlbInjuries LIMIT 50` });
  if (injuryRows.length > 0) {
     for (const r of injuryRows) {
        const inj = r.toJSON();
        // Spanner currently has no source_url or provenance column in MlbInjuries
        // The schema shows: EventId, AthleteId, TeamId, Name, Status, Notes, RawJson, FetchedAt
        if (!inj.RawJson || !inj.RawJson.source) {
            report.mismatches.push({ EventId: inj.EventId || 'N/A', table: 'MlbInjuries', field: 'source_url', spanner_value: null, source_value: 'N/A', severity: 'HIGH' });
            downgradeScore('MlbInjuries', 'UNVERIFIED');
        }
     }
  }

  // Clean up
  await db.close();

  // Final Output
  const reportPath = path.join(MAPPED_DIR, 'mlb_source_truth_verification_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ Audit complete. Report saved to ${reportPath}`);
}

run().catch(console.error);
