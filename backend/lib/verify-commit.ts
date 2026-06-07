import { Spanner } from '@google-cloud/spanner';

const SPANNER_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
const SPANNER_INSTANCE_ID = 'aura-governance-instance';
const SPANNER_DATABASE_ID = 'world-cup-db';

const spanner = new Spanner({ projectId: SPANNER_PROJECT_ID });
const instance = spanner.instance(SPANNER_INSTANCE_ID);
const database = instance.database(SPANNER_DATABASE_ID);

async function run() {
  console.log('--- POST-COMMIT VERIFICATION ---');

  // 1. Count WORLD_CUP players
  const [res1] = await database.run(`SELECT COUNT(*) as count FROM players WHERE league_id = 'WORLD_CUP'`);
  console.log(`1. Total WORLD_CUP players: ${res1[0].toJSON().count}`);

  // 2. Count by team
  console.log(`\n2. Players by Team:`);
  const [res2] = await database.run(`
    SELECT team_code, COUNT(*) as count 
    FROM players 
    WHERE league_id = 'WORLD_CUP' 
    GROUP BY team_code 
    ORDER BY team_code
  `);
  res2.forEach(row => {
    const r = row.toJSON();
    console.log(`   ${r.team_code}: ${r.count}`);
  });

  // 3. Verify player/team join
  const [res3] = await database.run(`
    SELECT COUNT(*) as count 
    FROM players p
    JOIN teams t ON p.league_id = t.league_id AND p.team_code = t.team_code
    WHERE p.league_id = 'WORLD_CUP'
  `);
  console.log(`\n3. Player/Team Join Count: ${res3[0].toJSON().count}`);

  // 4. Show sample rows
  console.log(`\n4. Sample Rows (Limit 20):`);
  const [res4] = await database.run(`
    SELECT league_id, team_code, player_id, name, jersey_number, position, age
    FROM players
    WHERE league_id = 'WORLD_CUP'
    LIMIT 20
  `);
  console.table(res4.map(r => r.toJSON()));

  // 5. Confirm blocked tables were untouched
  console.log(`\n5. Checking Blocked Tables:`);
  const blockedTables = ['injury_news', 'lineup_projections', 'team_power_ratings', 'team_trends'];
  for (const t of blockedTables) {
    try {
      const [res] = await database.run(`SELECT COUNT(*) as count FROM ${t}`);
      console.log(`   ${t} count: ${res[0].toJSON().count}`);
    } catch (e: any) {
      console.log(`   ${t} count: ERROR (${e.message})`);
    }
  }

  await database.close();
}

run().catch(console.error);
