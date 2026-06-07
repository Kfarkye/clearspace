// ============================================================================
// RESOLVE TEAM IDENTITIES
// File: backend/lib/resolve-world-cup-team-identities.ts
// ============================================================================
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OVERRIDES_OUTPUT = path.resolve(__dirname, '../../data/mapped/world_cup_team_identity_overrides.json');

export class ResolveWorldCupTeamIdentities {
  public async execute() {
    console.log(`[SYSTEM] Resolving ESPN Team Identities...`);
    
    // We manually reviewed the ESPN teams via their API
    // 164: Spain (ESP)
    // 202: Argentina (ARG)
    // 203: Mexico (MEX)
    // 205: Brazil (BRA)
    // 206: Canada (CAN)

    const overrides = [
      {
        espn_team_id: "164",
        espn_display_name: "Spain",
        espn_abbreviation: "ESP",
        spanner_team_code: "ESP",
        spanner_team_name: "Spain",
        match_basis: "manual_review_live_espn_name_match",
        confidence: "strong",
        approved_for_mapper: true
      },
      {
        espn_team_id: "202",
        espn_display_name: "Argentina",
        espn_abbreviation: "ARG",
        spanner_team_code: "ARG",
        spanner_team_name: "Argentina",
        match_basis: "manual_review_live_espn_name_match",
        confidence: "strong",
        approved_for_mapper: true
      },
      {
        espn_team_id: "203",
        espn_display_name: "Mexico",
        espn_abbreviation: "MEX",
        spanner_team_code: "MEX",
        spanner_team_name: "Mexico",
        match_basis: "manual_review_live_espn_name_match",
        confidence: "strong",
        approved_for_mapper: true
      },
      {
        espn_team_id: "205",
        espn_display_name: "Brazil",
        espn_abbreviation: "BRA",
        spanner_team_code: "BRA",
        spanner_team_name: "Brazil",
        match_basis: "manual_review_live_espn_name_match",
        confidence: "strong",
        approved_for_mapper: true
      },
      {
        espn_team_id: "206",
        espn_display_name: "Canada",
        espn_abbreviation: "CAN",
        spanner_team_code: "CAN",
        spanner_team_name: "Canada",
        match_basis: "manual_override",
        confidence: "exact",
        approved_for_mapper: true
      }
    ];

    const outputDir = path.dirname(OVERRIDES_OUTPUT);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    fs.writeFileSync(OVERRIDES_OUTPUT, JSON.stringify(overrides, null, 2), 'utf-8');
    console.log(`[SYSTEM] Wrote override file to: ${OVERRIDES_OUTPUT}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  new ResolveWorldCupTeamIdentities().execute().catch(err => {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
  });
}
