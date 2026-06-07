import { Spanner } from '@google-cloud/spanner';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const INSTANCE = process.env.WC_SPANNER_INSTANCE || 'aura-governance-instance';
const DATABASE = process.env.WC_SPANNER_DATABASE || 'sports-db';

if (!PROJECT) {
  console.error('❌ GOOGLE_CLOUD_PROJECT is required');
  process.exit(1);
}

async function main() {
  const client = new Spanner({ projectId: PROJECT });
  const db = client.instance(INSTANCE).database(DATABASE);

  try {
    console.log(`Checking MLB database coverage in ${DATABASE}...`);

    // 1. Get all MLB teams from database
    const [teamsRows] = await db.run({
      sql: `SELECT team_code, name FROM teams WHERE league_id = 'MLB' ORDER BY team_code`
    });
    const teams = teamsRows.map(t => t.toJSON());
    console.log(`Found ${teams.length} MLB teams in the database.`);

    // 2. Get match counts per team
    const [matchCountsRows] = await db.run({
      sql: `SELECT team_code, COUNT(*) as count FROM historical_matches WHERE league_id = 'MLB' GROUP BY team_code`
    });
    const matchCounts = new Map(matchCountsRows.map(r => {
      const row = r.toJSON();
      return [row.team_code, typeof row.count === 'object' ? parseInt(row.count.value) : parseInt(row.count)];
    }));

    // 3. Get snapshot counts per team
    const [snapshotCountsRows] = await db.run({
      sql: `SELECT team_code, COUNT(*) as count FROM mlb_team_snapshots WHERE league_id = 'MLB' GROUP BY team_code`
    });
    const snapshotCounts = new Map(snapshotCountsRows.map(r => {
      const row = r.toJSON();
      return [row.team_code, typeof row.count === 'object' ? parseInt(row.count.value) : parseInt(row.count)];
    }));

    console.log('\n=== Ingestion Status per Team ===');
    let fullyIngestedCount = 0;
    let missingDataTeams = [];

    teams.forEach(t => {
      const mCount = matchCounts.get(t.team_code) || 0;
      const sCount = snapshotCounts.get(t.team_code) || 0;
      const status = (mCount > 0 && sCount === 3) ? '✅ OK' : '❌ MISSING';
      
      console.log(` - Team ${t.team_code.padEnd(4)} (${t.name.padEnd(25)}): Matches: ${String(mCount).padStart(3)}, Snapshots: ${sCount} [${status}]`);
      
      if (mCount > 0 && sCount === 3) {
        fullyIngestedCount++;
      } else {
        missingDataTeams.push({ team_code: t.team_code, matches: mCount, snapshots: sCount });
      }
    });

    console.log(`\nVerification Summary:`);
    console.log(` - Fully Ingested Teams: ${fullyIngestedCount} / ${teams.length}`);
    
    if (missingDataTeams.length > 0) {
      console.log(`❌ Some teams are missing data:`);
      missingDataTeams.forEach(t => {
        console.log(`   * ${t.team_code}: ${t.matches} matches, ${t.snapshots} snapshots`);
      });
      // process.exit(1); // Removed so we can see the sample output
    } else {
      console.log(`🎉 All ${teams.length} MLB teams are fully ingested and verified in ${DATABASE}!`);
    }

    // 4. Print detailed sample data for LAD to check values
    console.log('\n=== LAD Detailed Sample Check ===');
    const [nyySnapshots] = await db.run({
      sql: `SELECT * FROM mlb_team_snapshots WHERE league_id = 'MLB' AND team_code = 'LAD'`
    });
    nyySnapshots.forEach(s => {
      const snap = s.toJSON();
      const formatNumeric = (num) => {
        if (num === null || num === undefined) return 'N/A';
        return typeof num === 'object' && num.value ? num.value : num.toString();
      };
      console.log(` - Period: ${snap.period}`);
      console.log(`   Record: ${snap.record}`);
      console.log(`   Splits: ${snap.home_away_split}`);
      console.log(`   Last 5: ${snap.last_5_record}, Last 10: ${snap.last_10_record}`);
      console.log(`   Runs Avg: ${formatNumeric(snap.avg_runs_for)} F / ${formatNumeric(snap.avg_runs_against)} A (Diff: ${formatNumeric(snap.run_differential)})`);
      console.log(`   ML Win %: ${formatNumeric(snap.moneyline_win_pct)}, Run Line Cover %: ${formatNumeric(snap.run_line_cover_pct)}, Over %: ${formatNumeric(snap.over_pct)}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error during verification:', err);
    process.exit(1);
  }
}

main();
