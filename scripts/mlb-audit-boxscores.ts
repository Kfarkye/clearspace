import { Spanner } from '@google-cloud/spanner';
import fs from 'fs';
import path from 'path';

const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
const instanceId = process.env.SPANNER_INSTANCE || 'clearspace';
const databaseId = process.env.SPANNER_DATABASE || 'clearspace-db';

const spanner = new Spanner({ projectId });
const instance = spanner.instance(instanceId);
const database = instance.database(databaseId);

const MAPPED_DIR = path.join(process.cwd(), 'data/mapped');
if (!fs.existsSync(MAPPED_DIR)) fs.mkdirSync(MAPPED_DIR, { recursive: true });

async function runAudit() {
  console.log('🔍 Starting MLB Boxscore Orphan Audit...');
  
  // Audit Batting
  console.log('Auditing MlbBoxscoreBatting...');
  const [battingRows] = await database.run({
    sql: `SELECT * FROM MlbBoxscoreBatting WHERE NOT EXISTS (SELECT 1 FROM MlbGames WHERE MlbGames.EventId = MlbBoxscoreBatting.EventId)`
  });
  
  const orphanedBattingPath = path.join(MAPPED_DIR, 'orphaned_batting_boxscores.json');
  fs.writeFileSync(orphanedBattingPath, JSON.stringify(battingRows.map(r => r.toJSON()), null, 2));
  console.log(`✅ Found ${battingRows.length} orphaned batting boxscores. Saved to ${orphanedBattingPath}`);

  // Audit Pitching
  console.log('Auditing MlbBoxscorePitching...');
  const [pitchingRows] = await database.run({
    sql: `SELECT * FROM MlbBoxscorePitching WHERE NOT EXISTS (SELECT 1 FROM MlbGames WHERE MlbGames.EventId = MlbBoxscorePitching.EventId)`
  });

  const orphanedPitchingPath = path.join(MAPPED_DIR, 'orphaned_pitching_boxscores.json');
  fs.writeFileSync(orphanedPitchingPath, JSON.stringify(pitchingRows.map(r => r.toJSON()), null, 2));
  console.log(`✅ Found ${pitchingRows.length} orphaned pitching boxscores. Saved to ${orphanedPitchingPath}`);

  await database.close();
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
