import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MANIFEST_PATH = path.resolve(__dirname, '../../data/raw/espn_core/fetch_manifest.json');
const DRY_RUN_OUTPUT = path.resolve(__dirname, '../../data/mapped/world_cup_dry_run.json');
const REPORT_PATH = path.resolve(__dirname, '../../data/mapped/world_cup_precommit_report.json');
const COMMIT_SCRIPT_PATH = path.resolve(__dirname, './commit-espn-world-cup-spanner.ts');

function generateReport() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const dryRun = JSON.parse(fs.readFileSync(DRY_RUN_OUTPUT, 'utf-8'));
  const commitScript = fs.readFileSync(COMMIT_SCRIPT_PATH, 'utf-8');

  const report: any = {
    counts: {
      teams: dryRun.teams?.length || 0,
      athletes: dryRun.athletes?.length || 0,
      injuries: dryRun.injuries?.length || 0,
      events: dryRun.events?.length || 0,
      odds: dryRun.odds?.length || 0,
      lineups: dryRun.lineups?.length || 0,
      unmapped_entities: dryRun.unmapped_entities || 0,
      rejected_rows: 0
    },
    unmapped_analysis: {},
    source_coverage: {
      status: 'FAIL',
      missing_fields: [] as string[]
    },
    schema_alignment: {
      status: 'FAIL',
      issues: [] as string[]
    },
    relational_joins: {
      status: 'FAIL',
      issues: [] as string[]
    },
    commit_script_inspection: {
      status: 'FAIL',
      violations: [] as string[]
    }
  };

  // 1 & 2. Unmapped Analysis
  const unmappedGroups: Record<string, { count: number, reason: string }> = {};
  for (const entry of manifest) {
    if (['teams', 'athletes', 'events'].includes(entry.payload_type)) {
      // These were mapped (or skeletons ignored)
    } else {
      if (!unmappedGroups[entry.payload_type]) {
        unmappedGroups[entry.payload_type] = { count: 0, reason: 'Payload type not supported by map-espn-world-cup-core-dry-run.ts mapper.' };
      }
      unmappedGroups[entry.payload_type].count++;
    }
    if (!entry.json_valid) {
       report.counts.rejected_rows++;
    }
  }
  report.unmapped_analysis = unmappedGroups;

  // 3. Source Coverage Verify
  // We check the first valid team, athlete, and event to see if they have the required fields
  const checkFields = (entities: any[], typeName: string) => {
    const valid = entities.filter(e => Object.keys(e).length > 0);
    if (valid.length > 0) {
      const e = valid[0];
      const required = ['league_id', 'source', 'source_url', 'fetched_at'];
      for (const req of required) {
        if (!(req in e)) {
          report.source_coverage.missing_fields.push(`Missing '${req}' in ${typeName}`);
        }
      }
    }
  };
  checkFields(dryRun.teams || [], 'teams');
  checkFields(dryRun.athletes || [], 'athletes');
  checkFields(dryRun.events || [], 'events');
  if (report.source_coverage.missing_fields.length === 0) {
    report.source_coverage.status = 'PASS';
  }

  // 4. Schema Alignment
  // Evaluate the keys vs standard
  // Standard from prompt: league_id = WORLD_CUP
  // Spanner missing required fields will cause rejection.
  report.schema_alignment.issues.push('Actual Spanner schema definition is unknown to the script, but current dry_run payload lacks league_id, source, source_url, etc. as seen in source_coverage.');
  
  // 5. Relational Joins
  // Check if foreign keys exist
  const checkFK = (entities: any[], typeName: string, fk: string) => {
    const valid = entities.filter(e => Object.keys(e).length > 0);
    if (valid.length > 0 && !(fk in valid[0])) {
      report.relational_joins.issues.push(`Foreign key '${fk}' missing in ${typeName}`);
    }
  };
  checkFK(dryRun.athletes || [], 'athletes', 'team_id');
  checkFK(dryRun.events || [], 'events', 'team_id'); // Events usually have competitors/team_id
  
  // injuries and odds are empty, so we just log it
  if (report.relational_joins.issues.length === 0) {
    report.relational_joins.status = 'PASS';
  }

  // 6. Inspect Commit Script
  const disallowed = ['impact_weight', 'market_penalty', 'fallback', 'generate', 'gateway', 'deployment'];
  for (const word of disallowed) {
    if (commitScript.toLowerCase().includes(word)) {
      report.commit_script_inspection.violations.push(`Found disallowed term: ${word}`);
    }
  }
  if (!commitScript.includes('CHUNK_SIZE')) {
    report.commit_script_inspection.violations.push('No chunked upserts detected');
  }

  if (report.commit_script_inspection.violations.length === 0) {
    report.commit_script_inspection.status = 'PASS';
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Report generated at ${REPORT_PATH}`);
}

generateReport();
