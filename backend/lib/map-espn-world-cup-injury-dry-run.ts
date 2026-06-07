import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Provenance {
  source: string;
  source_url: string;
  fetched_at: string;
  file_path: string;
  sha256_hash: string;
}

interface InjuryRow {
  league_id: string;
  team_code: string;
  injury_id: string;
  player_id: string;
  player_name: string;
  position: string | null;
  status: string;
  description: string;
  updated_at: string;
  provenance: Provenance;
}

function generateInjuryId(playerId: string, timestamp: number): string {
  return `inj_${playerId}_${timestamp}`;
}

async function run() {
  console.log('[SYSTEM] Starting WORLD_CUP Injury News V3 Dry Run...');

  const rootDir = path.resolve(__dirname, '../../');
  const rawDir = path.join(rootDir, 'data/raw/espn_core');
  const mappedDir = path.join(rootDir, 'data/mapped');
  
  if (!fs.existsSync(mappedDir)) fs.mkdirSync(mappedDir, { recursive: true });

  const manifestPath = path.join(rawDir, 'fetch_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('fetch_manifest.json not found in data/raw/espn_core');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const teamIdentityMapPath = path.join(mappedDir, 'team_identity_map.json');
  
  let teamIdentityMap: Record<string, any> = {};
  if (fs.existsSync(teamIdentityMapPath)) {
    teamIdentityMap = JSON.parse(fs.readFileSync(teamIdentityMapPath, 'utf8'));
  }

  const report = {
    metadata: {
      generated_at: new Date().toISOString(),
      target_table: 'injury_news',
      league_id: 'WORLD_CUP'
    },
    counts: {
      total_payloads_scanned: 0,
      potential_injuries_found: 0,
      injuries_mapped: 0,
      injuries_rejected: 0
    },
    rejections: [] as any[]
  };

  const mappedInjuries: InjuryRow[] = [];

  function addRejection(reason: string, data: any) {
    report.rejections.push({ reason, data });
    report.counts.injuries_rejected++;
  }

  const { Spanner } = await import('@google-cloud/spanner');
  const spanner = new Spanner({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829' });
  const instance = spanner.instance('aura-governance-instance');
  const database = instance.database('world-cup-db');
  
  let validPlayerIds = new Set<string>();
  try {
    const [playersRes] = await database.run(`SELECT player_id FROM players WHERE league_id = 'WORLD_CUP'`);
    playersRes.forEach(r => validPlayerIds.add(r.toJSON().player_id));
    console.log(`[SYSTEM] Loaded ${validPlayerIds.size} valid players from Spanner.`);
  } finally {
    await database.close();
  }

  for (const entry of manifest) {
    if (!entry.json_valid || !entry.file_path) continue;
    report.counts.total_payloads_scanned++;

    const isAthlete = entry.payload_type === 'athletes';
    const isInjuryEndpoint = entry.ref_url.includes('/injuries');

    if (!isAthlete && !isInjuryEndpoint) continue;

    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(entry.file_path, 'utf8'));
    } catch (e) {
      continue;
    }

    const provenanceObj: Provenance = {
      source: 'espn_core',
      source_url: entry.ref_url,
      fetched_at: entry.fetched_at,
      file_path: entry.file_path,
      sha256_hash: entry.sha256_hash
    };

    let injuriesToProcess: any[] = [];
    let espnTeamId: string | null = null;
    let playerId: string | null = null;
    let playerName: string | null = null;
    let positionName: string | null = null;

    if (isAthlete) {
      if (Array.isArray(payload.injuries) && payload.injuries.length > 0) {
        injuriesToProcess = payload.injuries;
      }
      const matchPattern = new RegExp('/teams/(\\\\d+)');
      const match = entry.ref_url.match(matchPattern);
      if (match) espnTeamId = match[1];
      else if (payload.team && payload.team.$ref) {
        const teamMatch = payload.team.$ref.match(matchPattern);
        if (teamMatch) espnTeamId = teamMatch[1];
      }
      playerId = payload.id;
      playerName = payload.fullName;
      positionName = payload.position?.name || null;
    } else if (isInjuryEndpoint) {
      if (Array.isArray(payload.items) && payload.items.length > 0) {
        injuriesToProcess = payload.items;
      }
      const matchPattern = new RegExp('/teams/(\\\\d+)');
      const match = entry.ref_url.match(matchPattern);
      if (match) espnTeamId = match[1];
    }

    if (injuriesToProcess.length === 0) continue;

    for (const inj of injuriesToProcess) {
      report.counts.potential_injuries_found++;

      // We might not have player ID if it came from the team injuries endpoint
      // ESPN usually nests athlete data inside the injury object if from endpoint
      const pId = playerId || inj.athlete?.id;
      const pName = playerName || inj.athlete?.fullName || 'Unknown';
      const pos = positionName || inj.athlete?.position?.name || null;

      const status = inj.status?.name || inj.status || 'Unknown';
      const description = inj.details || inj.shortComment || '';
      
      const injuryRow: any = {
        league_id: "WORLD_CUP",
        injury_id: inj.id || generateInjuryId(pId || 'unknown', Date.now()),
        player_id: pId,
        player_name: pName,
        position: pos,
        status: status,
        description: description,
        updated_at: entry.fetched_at,
        provenance: provenanceObj
      };

      if (!espnTeamId) {
        addRejection('MISSING_ESPN_TEAM_ID', injuryRow);
        continue;
      }

      const identity = teamIdentityMap[espnTeamId];
      const isStrongMatch = identity && (identity.confidence === 'exact' || identity.confidence === 'strong');

      if (!isStrongMatch) {
        addRejection('INVALID_TEAM_IDENTITY', { espn_team_id: espnTeamId, ...injuryRow });
        continue;
      }
      injuryRow.team_code = identity.team_code;

      if (!injuryRow.player_id) {
        addRejection('MISSING_PLAYER_ID', injuryRow);
        continue;
      }
      if (!validPlayerIds.has(injuryRow.player_id)) {
        addRejection('PLAYER_NOT_IN_LEDGER', injuryRow);
        continue;
      }
      if (!injuryRow.status) {
        addRejection('MISSING_STATUS', injuryRow);
        continue;
      }

      // Constraints validated:
      // league_id = WORLD_CUP
      // team_code mapped through identity
      // status present
      // provenance present
      // updated_at present
      
      mappedInjuries.push(injuryRow);
      report.counts.injuries_mapped++;
    }
  }

  const dryRunPath = path.join(mappedDir, 'world_cup_injury_news_dry_run_v1.json');
  fs.writeFileSync(dryRunPath, JSON.stringify(mappedInjuries, null, 2));

  const reportPath = path.join(mappedDir, 'world_cup_injury_news_precommit_report_v1.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`[SYSTEM] Dry Run Complete.`);
  console.log(`[SYSTEM] Payloads Scanned: ${report.counts.total_payloads_scanned}`);
  console.log(`[SYSTEM] Potential Injuries Found: ${report.counts.potential_injuries_found}`);
  console.log(`[SYSTEM] Injuries Mapped: ${report.counts.injuries_mapped}`);
  console.log(`[SYSTEM] Injuries Rejected: ${report.counts.injuries_rejected}`);
  console.log(`[SYSTEM] Report written to: ${reportPath}`);
}

run().catch(console.error);
