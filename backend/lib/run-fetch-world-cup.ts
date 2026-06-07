// ============================================================================
// EXECUTION TRIGGER: FETCH PHYSICAL PAYLOADS
// File: backend/lib/run-fetch-world-cup.ts
// ============================================================================
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { WorldCupPayloadFetcher } from './fetch-physical-payloads.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INVENTORY_PATH = path.resolve(__dirname, '../../samples/espn/worldcup_deep_schema_inventory.json');

async function executeFetch() {
  console.log(`[SYSTEM] Reading schema inventory from ${INVENTORY_PATH}`);
  
  if (!fs.existsSync(INVENTORY_PATH)) {
    console.error(`[FATAL] Schema inventory not found at ${INVENTORY_PATH}`);
    process.exit(1);
  }

  const rawInventory = fs.readFileSync(INVENTORY_PATH, 'utf-8');
  let inventory;
  try {
    inventory = JSON.parse(rawInventory);
  } catch (e) {
    console.error(`[FATAL] Invalid JSON in schema inventory: ${(e as Error).message}`);
    process.exit(1);
  }

  const refs: string[] = [];
  
  // Recursively extract all valid WORLD_CUP refs from the deep schema
  function extractRefs(obj: any) {
    if (typeof obj === 'string') {
      if (obj.includes('/sports/soccer/leagues/fifa.world/')) {
        refs.push(obj);
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(extractRefs);
    } else if (obj !== null && typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        extractRefs(obj[key]);
      }
    }
  }

  extractRefs(inventory);
  const uniqueRefs = [...new Set(refs)];

  if (uniqueRefs.length === 0) {
    console.error('[FATAL] No valid WORLD_CUP refs found in inventory.');
    process.exit(1);
  }

  console.log(`[SYSTEM] Extracted ${uniqueRefs.length} unique WORLD_CUP refs. Initiating fetcher...`);

  const fetcher = new WorldCupPayloadFetcher();
  await fetcher.fetchRefs(uniqueRefs);
  
  console.log('[SYSTEM] Fetch execution completed. Awaiting dry-run mapping phase.');
}

// Execute if run directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  executeFetch().catch(err => {
    console.error(`[FATAL] Unhandled exception during fetch execution: ${err.message}`);
    process.exit(1);
  });
}
