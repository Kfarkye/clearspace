import { Spanner } from '@google-cloud/spanner';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SPANNER_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
const SPANNER_INSTANCE_ID = 'aura-governance-instance';
const SPANNER_DATABASE_ID = 'world-cup-db';

const spanner = new Spanner({ projectId: SPANNER_PROJECT_ID });
const instance = spanner.instance(SPANNER_INSTANCE_ID);
const database = instance.database(SPANNER_DATABASE_ID);

async function run() {
  console.log('[SYSTEM] Starting Player Skeleton Quarantine Execution...');

  const planPath = path.resolve(__dirname, '../../data/mapped/player_skeleton_quarantine_plan.json');
  if (!fs.existsSync(planPath)) {
    throw new Error('Quarantine plan artifact not found.');
  }

  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const quarantineRows = plan.quarantine_rows;

  if (!quarantineRows || quarantineRows.length !== 144) {
    throw new Error(`Expected 144 skeleton rows to quarantine, found ${quarantineRows?.length}.`);
  }

  // 1. Export backup
  const backupPath = path.resolve(__dirname, '../../data/mapped/player_skeleton_quarantine_backup.json');
  fs.writeFileSync(backupPath, JSON.stringify(quarantineRows, null, 2));
  console.log(`[SYSTEM] Exported ${quarantineRows.length} skeleton rows to backup artifact: ${backupPath}`);

  // 2. Execute Deletion using primary keys
  const keysToDelete = quarantineRows.map((r: any) => [r.league_id, r.team_code, r.player_id]);
  const table = database.table('players');
  
  try {
    await table.deleteRows(keysToDelete);
    console.log(`[SYSTEM] Deleted ${keysToDelete.length} skeleton rows using primary keys.`);
  } catch(e: any) {
    console.error(`[FATAL] Delete operation failed: ${e.message}`);
    process.exit(1);
  }

  console.log('\\n--- POST-QUARANTINE VERIFICATION ---');

  // 1. Total WORLD_CUP players should be 124
  const [resTotal] = await database.run(`SELECT COUNT(*) as count FROM players WHERE league_id = 'WORLD_CUP'`);
  console.log(`1. Total WORLD_CUP players: ${resTotal[0].toJSON().count}`);

  // 2. ESPN Core players should be 124
  const [resEspn] = await database.run(`SELECT COUNT(*) as count FROM players WHERE league_id = 'WORLD_CUP' AND JSON_VALUE(provenance, '$.source') = 'espn_core'`);
  console.log(`2. ESPN Core players: ${resEspn[0].toJSON().count}`);

  // 3. Skeleton players should be 0
  const [resSkel] = await database.run(`SELECT COUNT(*) as count FROM players WHERE league_id = 'WORLD_CUP' AND (player_id LIKE 'player-%' OR name LIKE 'Player %' OR provenance IS NULL)`);
  console.log(`3. Skeleton players: ${resSkel[0].toJSON().count}`);

  // 4. Player/team join count should be 124
  const [resJoin] = await database.run(`
    SELECT COUNT(*) as count 
    FROM players p
    JOIN teams t ON p.league_id = t.league_id AND p.team_code = t.team_code
    WHERE p.league_id = 'WORLD_CUP'
  `);
  console.log(`4. Player/Team Join Count: ${resJoin[0].toJSON().count}`);

  // 5. Show count by team
  console.log(`\\n5. Count By Team:`);
  const [resTeamCount] = await database.run(`
    SELECT team_code, COUNT(*) as count 
    FROM players 
    WHERE league_id = 'WORLD_CUP' 
    GROUP BY team_code 
    ORDER BY team_code
  `);
  resTeamCount.forEach(row => {
    const r = row.toJSON();
    console.log(`   ${r.team_code}: ${r.count}`);
  });

  // 6. Show 20 sample players
  console.log(`\\n6. Sample Rows (Limit 20):`);
  const [resSample] = await database.run(`
    SELECT league_id, team_code, player_id, name, jersey_number, position, age 
    FROM players 
    WHERE league_id = 'WORLD_CUP' 
    LIMIT 20
  `);
  console.table(resSample.map(r => r.toJSON()));

  // 7. Confirm blocked tables row counts unchanged
  console.log(`\\n7. Blocked Tables Row Counts:`);
  const blockedTables = ['injury_news', 'lineup_projections', 'team_power_ratings', 'team_trends'];
  for (const t of blockedTables) {
    const [res] = await database.run(`SELECT COUNT(*) as count FROM ${t}`);
    console.log(`   ${t}: ${res[0].toJSON().count}`);
  }

  await database.close();
}

run().catch(console.error);
