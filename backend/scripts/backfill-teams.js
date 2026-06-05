import { Spanner } from '@google-cloud/spanner';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const INSTANCE = 'aura-governance-instance';
const DATABASE = 'world-cup-db';

async function main() {
  if (!PROJECT) {
    console.error('❌ GOOGLE_CLOUD_PROJECT is required');
    process.exit(1);
  }
  const client = new Spanner({ projectId: PROJECT });
  const db = client.instance(INSTANCE).database(DATABASE);

  console.log('Starting backfill for teams.is_placeholder...');
  try {
    const [rowCount] = await db.runPartitionedUpdate({
      sql: 'UPDATE teams SET is_placeholder = false WHERE is_placeholder IS NULL'
    });
    console.log(`Successfully updated ${rowCount} rows.`);
    process.exit(0);
  } catch (err) {
    console.error('Error during update:', err);
    process.exit(1);
  }
}

main();
