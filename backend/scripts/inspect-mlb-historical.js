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
      sql: `SELECT team_code, COUNT(*) as count FROM team_historical_snapshots WHERE league_id = 'MLB' GROUP BY team_code`
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
      process.exit(1);
    } else {
      console.log(`🎉 All ${teams.length} MLB teams are fully ingested and verified in ${DATABASE}!`);
    }

    // 4. Print detailed sample data for NYY to check values
    console.log('\n=== NYY Detailed Sample Check ===');
    const [nyySnapshots] = await db.run({
      sql: `SELECT * FROM team_historical_snapshots WHERE league_id = 'MLB' AND team_code = 'NYY'`
    });
    nyySnapshots.forEach(s => {
      const snap = s.toJSON();
      const formatNumeric = (num) => {
        if (num === null || num === undefined) return 'N/A';
        return typeof num === 'object' && num.value ? num.value : num.toString();
      };
      console.log(` - Period: ${snap.period}`);
      console.log(`   Form 5: ${snap.form_5}, Form 10: ${snap.form_10}`);
      console.log(`   Runs Avg: ${formatNumeric(snap.goals_for_avg)} F / ${formatNumeric(snap.goals_against_avg)} A`);
      console.log(`   Shutout Rate: ${formatNumeric(snap.clean_sheet_rate)}, Over 8.5 Rate: ${formatNumeric(snap.over_2_5_rate)}, BTTS Rate: ${formatNumeric(snap.btts_rate)}`);
      console.log(`   Win Rate: ${formatNumeric(snap.win_rate)}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error during verification:', err);
    process.exit(1);
  }
}

main();
