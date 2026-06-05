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

  console.log('Querying Spanner table list...');
  try {
    const [rows] = await db.run({
      sql: `SELECT table_name FROM information_schema.tables WHERE table_schema = ''`
    });
    console.log('Tables found:');
    rows.forEach(r => console.log(` - ${r.toJSON().table_name}`));

    // Check columns of teams table
    const [cols] = await db.run({
      sql: `SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_schema = '' AND table_name = 'teams'`
    });
    console.log('Columns of teams:');
    cols.forEach(c => {
      const col = c.toJSON();
      console.log(` - ${col.column_name} (${col.data_type}) NULLABLE:${col.is_nullable}`);
    });

    // Count how many teams have is_placeholder set, null, or false
    const [teamCounts] = await db.run({
      sql: `SELECT is_placeholder, COUNT(*) as count FROM teams GROUP BY is_placeholder`
    });
    console.log('Teams by is_placeholder:');
    teamCounts.forEach(tc => {
      const row = tc.toJSON();
      console.log(` - ${row.is_placeholder}: ${row.count}`);
    });

    // Print raw row of one team
    const [teamRows] = await db.run({
      sql: `SELECT * FROM teams LIMIT 1`
    });
    console.log('Raw Team Row:', JSON.stringify(teamRows[0].toJSON(), null, 2));

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
