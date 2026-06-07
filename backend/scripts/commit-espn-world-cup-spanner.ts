import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { WorldCupSpannerLedger } from '../lib/world-cup-spanner-ledger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAPPED_PAYLOAD_PATH = path.resolve(__dirname, '../../data/mapped/world_cup_dry_run.json');

async function executeSpannerCommit() {
  console.log(`[SYSTEM] Reading mapped payload from ${MAPPED_PAYLOAD_PATH}`);
  
  if (!fs.existsSync(MAPPED_PAYLOAD_PATH)) {
    console.error(`[FATAL] Mapped payload not found at ${MAPPED_PAYLOAD_PATH}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(MAPPED_PAYLOAD_PATH, 'utf-8');
  const mappedData = JSON.parse(rawData);

  // Using strictly controlled environment variables per architectural standards
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'aura-production';
  const instanceId = process.env.SPANNER_INSTANCE_ID || 'aura-sports-intelligence';
  const databaseId = process.env.SPANNER_DATABASE_ID || 'fifa-world-cup-2026';

  console.log(`[SYSTEM] Initializing Spanner Ledger (${projectId} / ${instanceId} / ${databaseId})`);
  const ledger = new WorldCupSpannerLedger(projectId, instanceId, databaseId);

  try {
    // Filter out unpopulated payload skeletons resulting from missing node data
    const validTeams = (mappedData.teams || []).filter((t: any) => Object.keys(t).length > 0);
    const validAthletes = (mappedData.athletes || []).filter((a: any) => Object.keys(a).length > 0);
    const validEvents = (mappedData.events || []).filter((e: any) => Object.keys(e).length > 0);

    if (validTeams.length > 0) {
      console.log(`[SYSTEM] Committing ${validTeams.length} validated teams...`);
      await ledger.commitMappedPayload('teams', validTeams);
    }
    
    if (validAthletes.length > 0) {
      console.log(`[SYSTEM] Committing ${validAthletes.length} validated athletes...`);
      await ledger.commitMappedPayload('athletes', validAthletes);
    }

    if (validEvents.length > 0) {
      console.log(`[SYSTEM] Committing ${validEvents.length} validated events...`);
      await ledger.commitMappedPayload('events', validEvents);
    }

    console.log('[SUCCESS] All structurally sound payloads successfully upserted to Spanner.');
  } catch (err) {
    console.error(`[FATAL] Spanner commit transaction failed: ${(err as Error).message}`);
    process.exit(1);
  }
}

executeSpannerCommit();
