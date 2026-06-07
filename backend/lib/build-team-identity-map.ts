// ============================================================================
// BUILD TEAM IDENTITY MAP (WITH CONFIDENCE SCORING)
// File: backend/lib/build-team-identity-map.ts
// ============================================================================
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Spanner } from '@google-cloud/spanner';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MANIFEST_PATH = path.resolve(__dirname, '../../data/raw/espn_core/fetch_manifest.json');
const IDENTITY_MAP_OUTPUT = path.resolve(__dirname, '../../data/mapped/team_identity_map.json');

const SPANNER_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
const SPANNER_INSTANCE = process.env.SPANNER_INSTANCE || 'aura-governance-instance';
const SPANNER_DATABASE = process.env.SPANNER_DATABASE || 'world-cup-db';

interface EspnTeam {
  id: string;
  name: string;
  abbreviation: string;
  slug: string;
}

interface SpannerTeam {
  league_id: string;
  team_code: string;
  name: string;
  display_name?: string;
  abbreviation?: string; // We might need to derive from team_code
  provenance: any;
}

interface TeamIdentityMap {
  mapping_required: boolean;
  mappings: Record<string, {
    team_code: string;
    name: string;
    espn_team_id: string;
    match_basis: string;
    confidence: 'exact' | 'strong' | 'weak' | 'failed';
  }>;
  unmapped_espn_teams: EspnTeam[];
  spanner_teams_inspected: number;
}

export class BuildTeamIdentityMap {
  public async execute() {
    console.log(`[SYSTEM] Connecting to Spanner: ${SPANNER_INSTANCE}/${SPANNER_DATABASE}`);
    
    let spannerTeams: SpannerTeam[] = [];
    try {
      const spannerClient = new Spanner({ projectId: SPANNER_PROJECT });
      const instance = spannerClient.instance(SPANNER_INSTANCE);
      const database = instance.database(SPANNER_DATABASE);

      const [rows] = await database.run({
        sql: "SELECT league_id, team_code, name, provenance FROM teams WHERE league_id = 'WORLD_CUP'",
      });
      spannerTeams = rows.map(r => r.toJSON()) as SpannerTeam[];
      console.log(`[SYSTEM] Fetched ${spannerTeams.length} teams from Spanner WORLD_CUP league.`);
      console.log(`[SYSTEM] Raw columns inspected: league_id, team_code, name, provenance`);
      await database.close();
    } catch (err) {
      console.error(`[WARNING] Failed to query Spanner: ${(err as Error).message}`);
    }

    if (!fs.existsSync(MANIFEST_PATH)) {
      throw new Error(`[FATAL] Manifest not found at ${MANIFEST_PATH}`);
    }

    const manifestRaw = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    const manifest = JSON.parse(manifestRaw);

    const espnTeams: EspnTeam[] = [];
    const espnTeamIdsNeeded = new Set<string>();
    
    for (const entry of manifest) {
      if (!entry.json_valid || !entry.file_path) continue;

      const payloadPath = path.resolve(__dirname, '../../', entry.file_path);
      if (!fs.existsSync(payloadPath)) continue;

      const payloadRaw = fs.readFileSync(payloadPath, 'utf-8');
      const payload = JSON.parse(payloadRaw);

      if (entry.payload_type === 'teams' && payload.id) {
        espnTeams.push({
          id: payload.id,
          name: payload.name || payload.shortName || 'Unknown',
          abbreviation: payload.abbreviation || '',
          slug: payload.slug || ''
        });
      }

      if (entry.payload_type === 'seasons' && payload.team && payload.team.$ref) {
        const match = payload.team.$ref.match(/teams\/(\d+)/);
        if (match) espnTeamIdsNeeded.add(match[1]);
      }
    }

    console.log(`[SYSTEM] ESPN Team IDs found in athlete refs: ${Array.from(espnTeamIdsNeeded).join(', ')}`);

    const result: TeamIdentityMap = {
      mapping_required: false,
      mappings: {},
      unmapped_espn_teams: [],
      spanner_teams_inspected: spannerTeams.length
    };

    const OVERRIDES_PATH = path.resolve(__dirname, '../../data/mapped/world_cup_team_identity_overrides.json');
    let overrides: any[] = [];
    if (fs.existsSync(OVERRIDES_PATH)) {
      overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf-8'));
    }

    for (const espnId of espnTeamIdsNeeded) {
      const teamPayload = espnTeams.find(t => t.id === espnId);
      const espnName = teamPayload ? teamPayload.name : 'Unknown';
      const espnAbbr = teamPayload ? teamPayload.abbreviation : 'UNK';

      let matchedSpannerTeam: SpannerTeam | undefined;
      let matchBasis = 'failed';
      let confidence: 'exact' | 'strong' | 'weak' | 'failed' = 'failed';

      // 0. Check Overrides
      const override = overrides.find(o => o.espn_team_id === espnId && o.approved_for_mapper);
      if (override) {
        matchedSpannerTeam = spannerTeams.find(st => st.team_code === override.spanner_team_code);
        if (matchedSpannerTeam) {
          matchBasis = override.match_basis;
          confidence = override.confidence;
        }
      }

      // 1. Check provenance.espn_id
      if (!matchedSpannerTeam) {
        matchedSpannerTeam = spannerTeams.find(st => st.provenance && st.provenance.espn_id === espnId);
        if (matchedSpannerTeam) {
          matchBasis = 'provenance.espn_id';
          confidence = 'exact';
        }
      }

      // 2. Check team_code abbreviation
      if (!matchedSpannerTeam && espnAbbr !== 'UNK') {
        matchedSpannerTeam = spannerTeams.find(st => st.team_code.toLowerCase() === espnAbbr.toLowerCase());
        if (matchedSpannerTeam) {
          matchBasis = 'abbreviation';
          confidence = 'strong';
        }
      }

      // 3. Check exact name match
      if (!matchedSpannerTeam && espnName !== 'Unknown') {
        matchedSpannerTeam = spannerTeams.find(st => st.name.toLowerCase() === espnName.toLowerCase());
        if (matchedSpannerTeam) {
          matchBasis = 'display_name';
          confidence = 'strong';
        }
      }

      // 4. Fuzzy match (weak)
      if (!matchedSpannerTeam && espnName !== 'Unknown') {
        matchedSpannerTeam = spannerTeams.find(st => 
          st.name.toLowerCase().includes(espnName.toLowerCase()) || 
          espnName.toLowerCase().includes(st.name.toLowerCase())
        );
        if (matchedSpannerTeam) {
          matchBasis = 'fuzzy_name';
          confidence = 'weak';
        }
      }

      if (matchedSpannerTeam && (confidence === 'exact' || confidence === 'strong')) {
        result.mappings[espnId] = {
          team_code: matchedSpannerTeam.team_code,
          name: matchedSpannerTeam.name,
          espn_team_id: espnId,
          match_basis: matchBasis,
          confidence: confidence
        };
      } else {
        if (matchedSpannerTeam) {
           // Weak match -> quarantine
           result.mappings[espnId] = {
            team_code: matchedSpannerTeam.team_code,
            name: matchedSpannerTeam.name,
            espn_team_id: espnId,
            match_basis: matchBasis,
            confidence: confidence
          };
        }
        result.unmapped_espn_teams.push({
          id: espnId,
          name: espnName,
          abbreviation: espnAbbr,
          slug: ''
        });
        result.mapping_required = true;
      }
    }

    const outputDir = path.dirname(IDENTITY_MAP_OUTPUT);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    fs.writeFileSync(IDENTITY_MAP_OUTPUT, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`[SYSTEM] Team Identity Map generated: ${IDENTITY_MAP_OUTPUT}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mapper = new BuildTeamIdentityMap();
  mapper.execute().catch(err => {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
  });
}
