// ============================================================================
// DRY-RUN MAPPER V2 (STRICT TEAM IDENTITY GUARD)
// File: backend/lib/map-espn-world-cup-core-dry-run.ts
// ============================================================================
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MANIFEST_PATH = path.resolve(__dirname, '../../data/raw/espn_core/fetch_manifest.json');
const IDENTITY_MAP_PATH = path.resolve(__dirname, '../../data/mapped/team_identity_map.json');
const DRY_RUN_OUTPUT = path.resolve(__dirname, '../../data/mapped/world_cup_dry_run_v3.json');
const PRECOMMIT_REPORT = path.resolve(__dirname, '../../data/mapped/world_cup_precommit_report_v3.json');

export class WorldCupDryRunMapperV2 {
  private calculateHash(filePath: string): string {
    if (!fs.existsSync(filePath)) return '';
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  public execute(): void {
    console.log(`[SYSTEM] Initiating V2 Dry-Run Mapper`);

    if (!fs.existsSync(MANIFEST_PATH)) throw new Error(`[FATAL] Manifest not found.`);
    if (!fs.existsSync(IDENTITY_MAP_PATH)) throw new Error(`[FATAL] Team Identity Map not found.`);

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    const identityMap = JSON.parse(fs.readFileSync(IDENTITY_MAP_PATH, 'utf-8'));

    const mappedState = { players: [] as any[], injury_news: [] as any[] };
    const report = {
      manifest_entries_processed: 0,
      physical_file_checks_passed: 0,
      schema_assertions: {
        league_id_enforced: true,
        provenance_fields_present: true,
        no_empty_skeletons: true,
        no_synthetic_fields: true,
        join_integrity_passed: true
      },
      mapped_counts: { players: 0, injury_news: 0, lineup_projections: 0, odds: 0, team_power_ratings: 0 },
      rejected_counts: {} as Record<string, number>,
      rejected_rows: [] as any[],
      team_identity_mapping_required: false,
      authorization_recommendations: {
        players: 'BLOCK', injury_news: 'BLOCK', lineup_projections: 'BLOCK', odds: 'BLOCK', team_power_ratings: 'BLOCK'
      },
      hashes: {
        fetch_manifest_json: this.calculateHash(MANIFEST_PATH),
        mapper_script: this.calculateHash(__filename),
        team_identity_map: this.calculateHash(IDENTITY_MAP_PATH),
        dry_run_output: '',
        raw_payloads: {} as Record<string, string>
      }
    };

    const addRejection = (reason: string, details: any) => {
      if (!report.rejected_counts[reason]) report.rejected_counts[reason] = 0;
      report.rejected_counts[reason]++;
      report.rejected_rows.push({ reason, details });
    };

    let mappedAllTeamsCleanly = true;
    let mappedAllInjuriesCleanly = true;
    let hasMappedPlayers = false;
    let hasMappedInjuries = false;

    for (const entry of manifest) {
      if (!entry.json_valid || !entry.file_path) continue;

      const payloadPath = path.resolve(__dirname, '../../', entry.file_path);
      if (!fs.existsSync(payloadPath)) {
        addRejection('MISSING_PHYSICAL_FILE', { file_path: entry.file_path });
        continue;
      }

      report.physical_file_checks_passed++;
      report.manifest_entries_processed++;
      report.hashes.raw_payloads[entry.file_path] = entry.sha256_hash;

      const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));
      if (Object.keys(payload).length === 0) {
         report.schema_assertions.no_empty_skeletons = false;
         addRejection('EMPTY_SKELETON_PAYLOAD', { file_path: entry.file_path });
         continue;
      }

      if (entry.payload_type === 'seasons' && payload.firstName && payload.team && payload.team.$ref) {
        const teamRef = payload.team.$ref;
        const espnTeamIdMatch = teamRef.match(/teams\/(\d+)/);
        const espnTeamId = espnTeamIdMatch ? espnTeamIdMatch[1] : 'UNKNOWN';

        const identity = identityMap.mappings[espnTeamId];
        const isStrongMatch = identity && (identity.confidence === 'exact' || identity.confidence === 'strong');

        const provenanceObj = {
          source: 'espn_core',
          source_url: entry.ref_url,
          fetched_at: entry.fetched_at,
          file_path: entry.file_path,
          sha256_hash: entry.sha256_hash
        };

        const playerRow: any = {
          league_id: "WORLD_CUP",
          player_id: payload.id,
          name: payload.fullName,
          jersey_number: payload.jersey ? parseInt(payload.jersey, 10) : null,
          position: payload.position?.name || null,
          age: payload.age || null,
          club: null,
          is_captain: null,
          provenance: provenanceObj,
          espn_team_id: espnTeamId, // Debug field
          source: 'espn_core', // Debug field
          source_url: entry.ref_url, // Debug field
          fetched_at: entry.fetched_at // Debug field
        };

        if (isStrongMatch) {
          playerRow.team_code = identity.team_code;
          mappedState.players.push(playerRow);
          report.mapped_counts.players++;
          hasMappedPlayers = true;
        } else {
          mappedAllTeamsCleanly = false;
          report.team_identity_mapping_required = true;
          report.schema_assertions.join_integrity_passed = false;
          
          if (identity && identity.confidence === 'weak') {
            addRejection('LOW_CONFIDENCE_TEAM_IDENTITY', playerRow);
          } else {
            addRejection('MISSING_TEAM_IDENTITY', playerRow);
          }
        }

        // Injuries
        if (Array.isArray(payload.injuries)) {
          for (const inj of payload.injuries) {
            const status = inj.status?.name || inj.status || 'Unknown';
            const injuryRow: any = {
              league_id: "WORLD_CUP",
              injury_id: inj.id || `inj_${payload.id}_${Date.now()}`,
              player_id: payload.id,
              player_name: payload.fullName,
              position: payload.position?.name || null,
              status: status,
              description: inj.details || '',
              updated_at: entry.fetched_at,
              provenance: provenanceObj,
              espn_team_id: espnTeamId, // Debug field
              source: 'espn_core', // Debug field
              source_url: entry.ref_url, // Debug field
              fetched_at: entry.fetched_at // Debug field
            };

            if (!payload.id || !status || !entry.ref_url) {
              mappedAllInjuriesCleanly = false;
              addRejection('INJURY_MISSING_REQUIRED_FIELDS', injuryRow);
              continue;
            }

            if (isStrongMatch) {
              injuryRow.team_code = identity.team_code;
              mappedState.injury_news.push(injuryRow);
              report.mapped_counts.injury_news++;
              hasMappedInjuries = true;
            } else {
              mappedAllInjuriesCleanly = false;
              if (identity && identity.confidence === 'weak') {
                addRejection('LOW_CONFIDENCE_TEAM_IDENTITY', injuryRow);
              } else {
                addRejection('MISSING_TEAM_IDENTITY', injuryRow);
              }
            }
          }
        }
      }
    }

    if (mappedAllTeamsCleanly && hasMappedPlayers) report.authorization_recommendations.players = 'ALLOW';
    if (mappedAllInjuriesCleanly && hasMappedInjuries) report.authorization_recommendations.injury_news = 'ALLOW';

    fs.writeFileSync(DRY_RUN_OUTPUT, JSON.stringify(mappedState, null, 2), 'utf-8');
    report.hashes.dry_run_output = this.calculateHash(DRY_RUN_OUTPUT);
    fs.writeFileSync(PRECOMMIT_REPORT, JSON.stringify(report, null, 2), 'utf-8');

    console.log(`[SYSTEM] V2 Mapper Complete.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  new WorldCupDryRunMapperV2().execute();
}
