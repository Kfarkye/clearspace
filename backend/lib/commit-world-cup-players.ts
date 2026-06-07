// ============================================================================
// COMMIT SCRIPT: NARROW SCOPE (PLAYERS ONLY)
// File: backend/lib/commit-world-cup-players.ts
// ============================================================================
import { Spanner } from '@google-cloud/spanner';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SPANNER_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
const SPANNER_INSTANCE_ID = 'aura-governance-instance';
const SPANNER_DATABASE_ID = 'world-cup-db';

const REPORT_PATH = path.resolve(__dirname, '../../data/mapped/world_cup_precommit_report_v3.json');
const DRY_RUN_PATH = path.resolve(__dirname, '../../data/mapped/world_cup_dry_run_v3.json');

const spanner = new Spanner({ projectId: SPANNER_PROJECT_ID });
const instance = spanner.instance(SPANNER_INSTANCE_ID);
const database = instance.database(SPANNER_DATABASE_ID);

export class CommitWorldCupPlayers {
  public async execute() {
    console.log(`[SYSTEM] Starting Narrow Ledger Commit (Players Only)...`);

    if (!fs.existsSync(REPORT_PATH) || !fs.existsSync(DRY_RUN_PATH)) {
      throw new Error('V3 artifacts missing. Cannot commit.');
    }

    const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'));
    if (report.authorization_recommendations.players !== 'ALLOW') {
      throw new Error(`[FATAL] Commit blocked. Players table authorization is not ALLOW: ${report.authorization_recommendations.players}`);
    }

    const dryRun = JSON.parse(fs.readFileSync(DRY_RUN_PATH, 'utf-8'));
    const playersToCommit = dryRun.players || [];

    if (playersToCommit.length === 0) {
      console.log(`[SYSTEM] No players to commit.`);
      return;
    }

    console.log(`[SYSTEM] Preparing to upsert ${playersToCommit.length} players into Spanner...`);

    // Clean up debug keys and map to exact schema
    const rowsToUpsert = playersToCommit.map((p: any) => ({
      league_id: p.league_id,
      team_code: p.team_code,
      player_id: p.player_id,
      name: p.name,
      jersey_number: p.jersey_number,
      position: p.position,
      age: p.age,
      club: p.club,
      is_captain: p.is_captain,
      provenance: JSON.stringify(p.provenance),
      created_at: new Date()
    }));

    // Chunk size: Spanner limit is 20,000 mutations, we're well within it but chunking is good practice
    const chunkSize = 100;
    let committedCount = 0;

    for (let i = 0; i < rowsToUpsert.length; i += chunkSize) {
      const chunk = rowsToUpsert.slice(i, i + chunkSize);
      const table = database.table('players');
      
      try {
        await table.upsert(chunk);
        committedCount += chunk.length;
        console.log(`[SYSTEM] Chunk ${i/chunkSize + 1}: committed ${chunk.length} rows.`);
      } catch (err: any) {
        console.error(`[ERROR] Failed on chunk ${i/chunkSize + 1}:`, err.message);
        throw err;
      }
    }

    console.log(`[SYSTEM] Narrow Commit Complete. Upserted ${committedCount} total rows into 'players' table.`);
    
    // Post-commit row count verification
    try {
      const [rowCountResult] = await database.run({
        sql: `SELECT COUNT(*) as count FROM players WHERE league_id = 'WORLD_CUP'`
      });
      const dbCount = rowCountResult[0].toJSON().count;
      console.log(`[SYSTEM] Post-commit ledger verification: ${dbCount} total rows in 'players' table for WORLD_CUP.`);
    } catch (err: any) {
      console.log(`[SYSTEM] Post-commit verification query failed: ${err.message}`);
    }

    // Close spanner instance
    await database.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  new CommitWorldCupPlayers().execute().catch(err => {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
  });
}
