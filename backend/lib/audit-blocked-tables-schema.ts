import { Spanner } from '@google-cloud/spanner';

const SPANNER_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
const SPANNER_INSTANCE_ID = 'aura-governance-instance';
const SPANNER_DATABASE_ID = 'world-cup-db';

const spanner = new Spanner({ projectId: SPANNER_PROJECT_ID });
const instance = spanner.instance(SPANNER_INSTANCE_ID);
const database = instance.database(SPANNER_DATABASE_ID);

async function run() {
  const tables = ['injury_news', 'lineup_projections', 'team_power_ratings', 'team_trends'];
  
  console.log('====================================================');
  console.log(' BLOCKED TABLES SCHEMA AUDIT');
  console.log('====================================================');

  const ddlProposals: string[] = [];

  for (const table of tables) {
    console.log(`\n\n--- TABLE: ${table.toUpperCase()} ---`);
    
    // 1. Show columns from INFORMATION_SCHEMA
    const [colsRes] = await database.run(`
      SELECT COLUMN_NAME, SPANNER_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = '${table}'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('\n[COLUMNS]');
    console.table(colsRes.map(r => r.toJSON()));

    const colNames = colsRes.map(r => r.toJSON().COLUMN_NAME);

    // 2. Show primary keys
    const [pkRes] = await database.run(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.INDEX_COLUMNS
      WHERE TABLE_NAME = '${table}' AND INDEX_NAME = 'PRIMARY_KEY'
      ORDER BY ORDINAL_POSITION
    `);
    console.log('\n[PRIMARY KEYS]');
    console.log(pkRes.map(r => r.toJSON().COLUMN_NAME).join(', '));

    // 3. Show 10 sample rows
    console.log('\n[SAMPLE ROWS (Limit 10)]');
    try {
      const [sampleRes] = await database.run(`SELECT * FROM ${table} LIMIT 10`);
      console.table(sampleRes.map(r => r.toJSON()));
    } catch(err: any) {
      console.log(`Error fetching samples: ${err.message}`);
    }

    // 4. Identify if source/source_url/updated_at/fetched_at exist
    const hasSource = colNames.includes('source');
    const hasSourceUrl = colNames.includes('source_url');
    const hasUpdatedAt = colNames.includes('updated_at');
    const hasFetchedAt = colNames.includes('fetched_at');
    const hasProvenance = colNames.includes('provenance');

    console.log('\n[V3 PROVENANCE COLUMN CHECK]');
    console.log(`- source: ${hasSource}`);
    console.log(`- source_url: ${hasSourceUrl}`);
    console.log(`- updated_at: ${hasUpdatedAt}`);
    console.log(`- fetched_at: ${hasFetchedAt}`);
    console.log(`- provenance: ${hasProvenance}`);

    // 5. Identify if provenance JSON column can be safely added
    if (!hasProvenance) {
      console.log('\n✅ CONCLUSION: It is safe to add a `provenance JSON` column to this table.');
      ddlProposals.push(`ALTER TABLE ${table} ADD COLUMN provenance JSON;`);
    } else {
      console.log('\n⚠️ CONCLUSION: `provenance` column already exists.');
    }
  }

  console.log('\n\n====================================================');
  console.log(' DDL PROPOSAL (DO NOT EXECUTE YET)');
  console.log('====================================================');
  ddlProposals.forEach(ddl => console.log(ddl));
  
  await database.close();
}

run().catch(console.error);
