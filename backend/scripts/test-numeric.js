import { Spanner } from '@google-cloud/spanner';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const INSTANCE = 'aura-governance-instance';
const DATABASE = 'world-cup-db';

async function main() {
  const client = new Spanner({ projectId: PROJECT });
  const db = client.instance(INSTANCE).database(DATABASE);

  try {
    const [rows] = await db.run({
      sql: `SELECT * FROM team_historical_snapshots WHERE team_code = 'USA' LIMIT 1`
    });
    const row = rows[0].toJSON();
    console.log('Type of goals_for_avg:', typeof row.goals_for_avg);
    console.log('Constructor name:', row.goals_for_avg.constructor.name);
    console.log('Value:', row.goals_for_avg);
    console.log('Serialized to JSON:', JSON.stringify(row));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
