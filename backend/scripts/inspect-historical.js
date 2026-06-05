import { Spanner } from '@google-cloud/spanner';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const INSTANCE = 'aura-governance-instance';
const DATABASE = 'world-cup-db';

async function main() {
  const client = new Spanner({ projectId: PROJECT });
  const db = client.instance(INSTANCE).database(DATABASE);

  try {
    console.log('Querying historical_matches for USA...');
    const [matches] = await db.run({
      sql: `SELECT * FROM historical_matches WHERE team_code = 'USA' ORDER BY match_date DESC LIMIT 5`
    });
    console.log('Matches (Last 5):');
    matches.forEach(m => {
      const match = m.toJSON();
      console.log(` - ${match.match_date}: USA ${match.goals_for} - ${match.goals_against} ${match.opponent_code} (${match.result}) [${match.competition}]`);
    });

    console.log('\nQuerying team_historical_snapshots for USA...');
    const [snapshots] = await db.run({
      sql: `SELECT * FROM team_historical_snapshots WHERE team_code = 'USA'`
    });
    console.log('Snapshots:');
    snapshots.forEach(s => {
      const snap = s.toJSON();
      console.log(` - Period: ${snap.period}`);
      console.log(`   Form 5: ${snap.form_5}, Form 10: ${snap.form_10}`);
      console.log(`   Goals For Avg: ${snap.goals_for_avg}, Goals Against Avg: ${snap.goals_against_avg}`);
      console.log(`   Clean Sheet Rate: ${snap.clean_sheet_rate}, Over 2.5 Rate: ${snap.over_2_5_rate}, BTTS Rate: ${snap.btts_rate}`);
      console.log(`   Win Rate: ${snap.win_rate}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error querying Spanner:', err);
    process.exit(1);
  }
}

main();
