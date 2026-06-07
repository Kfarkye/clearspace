import { Spanner } from '@google-cloud/spanner';

const SPANNER_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
const SPANNER_INSTANCE_ID = 'aura-governance-instance';
const SPANNER_DATABASE_ID = 'world-cup-db';

const spanner = new Spanner({ projectId: SPANNER_PROJECT_ID });
const instance = spanner.instance(SPANNER_INSTANCE_ID);
const database = instance.database(SPANNER_DATABASE_ID);

async function runDDL() {
  console.log('[SYSTEM] Executing Provenance DDL on Blocked Tables...');

  const ddlStatements = [
    'ALTER TABLE injury_news ADD COLUMN provenance JSON',
    'ALTER TABLE lineup_projections ADD COLUMN provenance JSON',
    'ALTER TABLE team_power_ratings ADD COLUMN provenance JSON',
    'ALTER TABLE team_trends ADD COLUMN provenance JSON'
  ];

  try {
    const [operation] = await database.updateSchema(ddlStatements);
    console.log('[SYSTEM] Waiting for DDL operation to complete...');
    await operation.promise();
    console.log('[SYSTEM] DDL operation completed successfully.');
  } catch (e: any) {
    console.error(`[FATAL] DDL operation failed: ${e.message}`);
    process.exit(1);
  }

  console.log('\\n--- POST-DDL SCHEMA VERIFICATION ---');
  const tables = ['injury_news', 'lineup_projections', 'team_power_ratings', 'team_trends'];

  for (const table of tables) {
    console.log(`\\nTable: ${table}`);
    
    // Verify Column
    const [colRes] = await database.run(`
      SELECT COLUMN_NAME, SPANNER_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = '${table}' AND COLUMN_NAME = 'provenance'
    `);
    
    if (colRes.length > 0) {
      console.log(`- Column verification: SUCCESS (${colRes[0].toJSON().COLUMN_NAME} is ${colRes[0].toJSON().SPANNER_TYPE})`);
    } else {
      console.log(`- Column verification: FAILED (provenance column not found)`);
    }

    // Verify Count
    const [countRes] = await database.run(`SELECT COUNT(*) as count FROM ${table}`);
    console.log(`- Row count: ${countRes[0].toJSON().count}`);
  }

  await database.close();
}

runDDL().catch(console.error);
