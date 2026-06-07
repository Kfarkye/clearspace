import { Spanner } from '@google-cloud/spanner';

const SPANNER_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
const SPANNER_INSTANCE_ID = 'aura-governance-instance';
const SPANNER_DATABASE_ID = 'world-cup-db';

const spanner = new Spanner({ projectId: SPANNER_PROJECT_ID });
const instance = spanner.instance(SPANNER_INSTANCE_ID);
const database = instance.database(SPANNER_DATABASE_ID);

async function runAudit() {
  console.log('--- PLAYER PROVENANCE AUDIT ---');

  // 1. Count players by provenance/source
  const [res1] = await database.run(`
    SELECT JSON_VALUE(provenance, '$.source') AS source, COUNT(*) AS count
    FROM players
    WHERE league_id = 'WORLD_CUP'
    GROUP BY source
    ORDER BY count DESC
  `);
  console.log('\\n1. Count players by provenance/source:');
  console.table(res1.map(r => r.toJSON()));

  // 2. Count skeleton/test players
  const [res2] = await database.run(`
    SELECT COUNT(*) AS skeleton_count
    FROM players
    WHERE league_id = 'WORLD_CUP'
    AND (player_id LIKE 'player-%' OR name LIKE 'Player %')
  `);
  const skeletonCount = res2[0].toJSON().skeleton_count;
  console.log(`\\n2. Skeleton/test players count: ${skeletonCount}`);

  // 3. Show skeleton samples
  const [res3] = await database.run(`
    SELECT league_id, team_code, player_id, name, position, age, TO_JSON_STRING(provenance) AS provenance_json
    FROM players
    WHERE league_id = 'WORLD_CUP'
    AND (player_id LIKE 'player-%' OR name LIKE 'Player %')
    LIMIT 25
  `);
  console.log(`\\n3. Skeleton samples:`);
  console.table(res3.map(r => r.toJSON()));

  // 4. Count verified ESPN players
  const [res4] = await database.run(`
    SELECT COUNT(*) AS espn_core_count
    FROM players
    WHERE league_id = 'WORLD_CUP'
    AND JSON_VALUE(provenance, '$.source') = 'espn_core'
  `);
  const verifiedCount = res4[0].toJSON().espn_core_count;
  console.log(`\\n4. Verified ESPN players count: ${verifiedCount}`);

  // 5. Dry-run cleanup plan
  console.log(`\\n--- DRY-RUN CLEANUP PLAN (No deletes yet) ---`);
  console.log(`- rows_to_keep: ${verifiedCount} (verified espn_core)`);
  console.log(`- rows_to_quarantine: ${skeletonCount} (placeholder IDs/names)`);
  console.log(`- quarantine reason: Artificial/Skeleton data pre-dating V3 execution`);

  console.log('\\n--- BLOCKED TABLES PROVENANCE AUDIT ---');
  const blockedTables = ['injury_news', 'lineup_projections', 'team_power_ratings', 'team_trends'];
  for (const t of blockedTables) {
    console.log(`\\nTable: ${t}`);
    try {
      // total rows
      const [rTotal] = await database.run(`SELECT COUNT(*) as count FROM ${t}`);
      console.log(`- total rows: ${rTotal[0].toJSON().count}`);

      // count by provenance
      // handle potential missing provenance column gracefully since some might not have it yet
      const [rProv] = await database.run(`
        SELECT JSON_VALUE(provenance, '$.source') AS source, COUNT(*) AS count
        FROM ${t}
        GROUP BY source
      `);
      console.table(rProv.map(r => r.toJSON()));

      // count of rows with missing provenance
      const [rMissing] = await database.run(`
        SELECT COUNT(*) AS count
        FROM ${t}
        WHERE provenance IS NULL OR JSON_VALUE(provenance, '$.source') IS NULL
      `);
      console.log(`- rows with missing provenance: ${rMissing[0].toJSON().count}`);

      // sample rows
      const [rSamples] = await database.run(`SELECT * FROM ${t} LIMIT 3`);
      console.log(`- sample rows:`);
      console.log(JSON.stringify(rSamples.map(r => r.toJSON()), null, 2));

    } catch (e: any) {
      console.log(`[ERROR] ${e.message}`);
    }
  }

  await database.close();
}

runAudit().catch(console.error);
