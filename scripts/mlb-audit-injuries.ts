import { Spanner } from '@google-cloud/spanner';
import fs from 'fs';
import path from 'path';
import { ResilientNetworkClient } from '../backend/lib/intelligence-service.js';

const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
const instanceId = process.env.SPANNER_INSTANCE || 'clearspace';
const databaseId = process.env.SPANNER_DATABASE || 'clearspace-db';

const spanner = new Spanner({ projectId });
const instance = spanner.instance(instanceId);
const database = instance.database(databaseId);

const MAPPED_DIR = path.join(process.cwd(), 'data/mapped');
if (!fs.existsSync(MAPPED_DIR)) fs.mkdirSync(MAPPED_DIR, { recursive: true });

async function runAudit() {
  console.log('🔍 Starting MLB Injuries Source Diff Audit...');

  // 1. Fetch Ground Truth via ResilientNetworkClient
  console.log('Fetching ESPN ground truth...');
  let espnData;
  try {
    const res = await ResilientNetworkClient.executeWithTimeout(async (signal) => {
      const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/injuries', { signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return response.json();
    }, 300000);
    espnData = res;
  } catch (error) {
    console.error('❌ Failed to fetch ground truth:', error.message);
    process.exit(1);
  }

  // Flatten injuries from all teams
  const espnInjuries = new Map<string, any>();
  for (const teamInj of espnData.injuries || []) {
    for (const inj of teamInj.injuries || []) {
      const athId = inj.athlete?.id;
      if (!athId) continue;
      espnInjuries.set(athId, {
        athlete_id: athId,
        name: inj.athlete?.displayName,
        status: inj.status?.name || inj.type?.description || 'Unknown',
        return_date: inj.details?.returnDate || null,
        notes: inj.details?.detail || inj.shortComment || null
      });
    }
  }

  // 2. Fetch Spanner State
  console.log('Fetching Spanner state...');
  const [rows] = await database.run({ sql: `SELECT AthleteId, Name, Status, Notes, RawJson FROM MlbInjuries` });
  
  const spannerInjuries = new Map<string, any>();
  rows.forEach(row => {
    const data = row.toJSON();
    let raw = {};
    if (data.RawJson) {
      if (typeof data.RawJson === 'object') {
        raw = data.RawJson;
      } else if (data.RawJson === '[object Object]') {
        raw = {};
      } else {
        try { raw = JSON.parse(data.RawJson); } catch (e) {}
      }
    }
    spannerInjuries.set(data.AthleteId, {
      athlete_id: data.AthleteId,
      name: data.Name,
      status: data.Status,
      return_date: raw.details?.returnDate || null,
      notes: data.Notes
    });
  });

  // 3. Diffing Logic
  const diff = {
    proposed_updates: [] as any[],
    proposed_inserts: [] as any[],
    proposed_clears: [] as any[]
  };

  for (const [athId, espnInj] of espnInjuries.entries()) {
    if (spannerInjuries.has(athId)) {
      const spannerInj = spannerInjuries.get(athId);
      // Check for discrepancies
      if (espnInj.status !== spannerInj.status || espnInj.return_date !== spannerInj.return_date) {
        diff.proposed_updates.push({
          player_id: athId,
          name: espnInj.name,
          current: { status: spannerInj.status, expected_return_date: spannerInj.return_date },
          proposed: { status: espnInj.status, expected_return_date: espnInj.return_date }
        });
      }
    } else {
      diff.proposed_inserts.push({
        player_id: athId,
        name: espnInj.name,
        proposed: { status: espnInj.status, expected_return_date: espnInj.return_date }
      });
    }
  }

  for (const [athId, spannerInj] of spannerInjuries.entries()) {
    if (!espnInjuries.has(athId)) {
      diff.proposed_clears.push({
        player_id: athId,
        name: spannerInj.name,
        current: { status: spannerInj.status, expected_return_date: spannerInj.return_date }
      });
    }
  }

  // Output
  const diffPath = path.join(MAPPED_DIR, 'injury_mutations_proposed.json');
  fs.writeFileSync(diffPath, JSON.stringify(diff, null, 2));
  console.log(`✅ Generated diff report with ${diff.proposed_updates.length} updates, ${diff.proposed_inserts.length} inserts, and ${diff.proposed_clears.length} clears.`);
  console.log(`Saved to ${diffPath}`);

  await database.close();
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
