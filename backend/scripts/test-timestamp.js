import { Spanner } from '@google-cloud/spanner';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const INSTANCE = 'aura-governance-instance';
const DATABASE = 'world-cup-db';

async function main() {
  const client = new Spanner({ projectId: PROJECT });
  const db = client.instance(INSTANCE).database(DATABASE);

  try {
    const startTime = new Date().toISOString();
    const [rows] = await db.run({
      sql: 'SELECT * FROM matches WHERE updated_at < @runStart LIMIT 1',
      params: { runStart: startTime }
    });
    console.log('Success! Found matches:', rows.length);
    process.exit(0);
  } catch (err) {
    console.error('Failed to query with Date object:', err);
    process.exit(1);
  }
}

main();
