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
  console.log('[SYSTEM] Starting Skeleton Player Quarantine Dry-Run...');

  // 1. Fetch all skeletons to quarantine
  const [quarantineRes] = await database.run(`
    SELECT league_id, team_code, player_id, name, position, age
    FROM players
    WHERE league_id = 'WORLD_CUP'
    AND (
      player_id LIKE 'player-%'
      OR name LIKE 'Player %'
      OR provenance IS NULL
    )
  `);

  const quarantineRows = quarantineRes.map(r => r.toJSON());

  // 2. Fetch count of valid rows to keep
  const [keepRes] = await database.run(`
    SELECT COUNT(*) as count
    FROM players
    WHERE league_id = 'WORLD_CUP'
    AND NOT (
      player_id LIKE 'player-%'
      OR name LIKE 'Player %'
      OR provenance IS NULL
    )
  `);
  const keepCount = keepRes[0].toJSON().count;

  // 3. Extract affected team codes
  const affectedTeams = new Set<string>();
  quarantineRows.forEach(r => affectedTeams.add(r.team_code));

  // 4. Build output plan
  const plan = {
    metadata: {
      generated_at: new Date().toISOString(),
      rows_to_keep: keepCount,
      rows_to_quarantine: quarantineRows.length,
      affected_team_codes: Array.from(affectedTeams).sort()
    },
    quarantine_strategy: {
      action: 'DELETE',
      rollback: 'UPSERT using this very JSON artifact',
      target: "players WHERE league_id = 'WORLD_CUP' AND (player_id LIKE 'player-%' OR name LIKE 'Player %' OR provenance IS NULL)"
    },
    quarantine_rows: quarantineRows,
    sample_quarantine_rows: quarantineRows.slice(0, 10)
  };

  const outPath = path.resolve(__dirname, '../../data/mapped/player_skeleton_quarantine_plan.json');
  fs.writeFileSync(outPath, JSON.stringify(plan, null, 2));

  console.log(`[SYSTEM] Plan written to ${outPath}`);
  console.log(`[SYSTEM] Rows to keep: ${keepCount}, Rows to quarantine: ${quarantineRows.length}`);
  
  await database.close();
}

run().catch(console.error);
