import { promises as fsPromises, createReadStream } from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class EspnCoreDryRunMapper {
  private diagnostics = {
    mapped_row_counts: { teams: 0, players: 0, injury_news: 0, odds: 0, lineup_projections: 0, team_power_ratings: 0 },
    sample_mapped_rows: {} as Record<string, any>,
    rejected_row_count: 0,
    rejected_row_reasons: {} as Record<string, number>,
    missing_fields_summary: {} as Record<string, number>,
    team_identity_join_results: { successful: 0, failed: 0 },
    authorization_recommendation: {} as Record<string, string>
  };

  private logRejection(reason: string) {
    this.diagnostics.rejected_row_count++;
    this.diagnostics.rejected_row_reasons[reason] = (this.diagnostics.rejected_row_reasons[reason] || 0) + 1;
  }

  private trackMissing(field: string) {
    this.diagnostics.missing_fields_summary[field] = (this.diagnostics.missing_fields_summary[field] || 0) + 1;
  }

  public mapPlayer(rawAthlete: any, teamId: string | null) {
    if (!rawAthlete || !rawAthlete.id) {
      this.logRejection('Missing physical athlete ID');
      return null;
    }
    if (!teamId) {
      this.logRejection('Cannot join to existing team WHERE league_id = WORLD_CUP');
      this.diagnostics.team_identity_join_results.failed++;
      return null;
    }

    this.diagnostics.team_identity_join_results.successful++;

    const player = {
      player_id: rawAthlete.id,
      team_id: teamId,
      league_id: 'WORLD_CUP',
      full_name: rawAthlete.fullName || null,
      position: rawAthlete.position?.name || null,
      source: 'espn_core',
      source_url: rawAthlete.$ref || null,
      fetched_at: new Date().toISOString(),
      raw_payload: JSON.stringify(rawAthlete)
    };

    if (!player.full_name) this.trackMissing('players.full_name');
    if (!player.position) this.trackMissing('players.position');

    this.diagnostics.mapped_row_counts.players++;
    if (!this.diagnostics.sample_mapped_rows.players) {
      this.diagnostics.sample_mapped_rows.players = player;
    }
    return player;
  }

  public mapInjury(rawInjury: any, playerId: string | null, teamId: string | null) {
    if (!rawInjury || !rawInjury.id) {
      this.logRejection('Missing physical injury ID');
      return null;
    }
    if (!playerId || !teamId) {
      this.logRejection('Injury missing player/team relational mapping');
      return null;
    }

    const injury = {
      injury_id: rawInjury.id,
      player_id: playerId,
      team_id: teamId,
      league_id: 'WORLD_CUP',
      status: rawInjury.status || null,
      details: rawInjury.details || null,
      source: 'espn_core',
      source_url: rawInjury.$ref || null,
      fetched_at: new Date().toISOString(),
      raw_payload: JSON.stringify(rawInjury)
    };

    if (!injury.status) this.trackMissing('injury_news.status');

    this.diagnostics.mapped_row_counts.injury_news++;
    if (!this.diagnostics.sample_mapped_rows.injury_news) {
      this.diagnostics.sample_mapped_rows.injury_news = injury;
    }
    return injury;
  }

  public async generateDiagnosticReport(outputPath: string) {
    this.diagnostics.authorization_recommendation = {
      players: this.diagnostics.mapped_row_counts.players > 0 ? 'ALLOW' : 'BLOCK',
      injury_news: this.diagnostics.mapped_row_counts.injury_news > 0 ? 'ALLOW' : 'BLOCK',
      lineup_projections: this.diagnostics.mapped_row_counts.lineup_projections > 0 ? 'ALLOW' : 'BLOCK',
      odds: this.diagnostics.mapped_row_counts.odds > 0 ? 'ALLOW' : 'BLOCK',
      team_power_ratings: this.diagnostics.mapped_row_counts.team_power_ratings > 0 ? 'ALLOW' : 'BLOCK'
    };

    await fsPromises.writeFile(outputPath, JSON.stringify(this.diagnostics, null, 2));
  }
}

export async function executeDryRun() {
  const mapper = new EspnCoreDryRunMapper();
  // Ensure we are resolving to the root clearspace dir
  const samplesDir = path.join(__dirname, '../../samples', 'espn');
  
  const processFile = async (filename: string, processor: (raw: any) => void) => {
    try {
      const filePath = path.join(samplesDir, filename);
      const fileStream = createReadStream(filePath);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
      for await (const line of rl) {
        if (line.trim()) processor(JSON.parse(line));
      }
    } catch (e) {
      console.error(`Error processing file ${filename}: ${e.message}`);
    }
  };

  await processFile('core_athletes_raw.jsonl', (raw) => {
    const teamId = raw.team?.$ref?.split('/')?.pop()?.split('?')?.[0] || null;
    mapper.mapPlayer(raw, teamId);
  });

  await processFile('core_team_injuries_raw.jsonl', (raw) => {
    const playerId = raw.athlete?.$ref?.split('/')?.pop()?.split('?')?.[0] || null;
    const teamId = raw.team?.$ref?.split('/')?.pop()?.split('?')?.[0] || null;
    mapper.mapInjury(raw, playerId, teamId);
  });

  const outPath = path.join(__dirname, '../../aura_espn_worldcup_mapper_dry_run.json');
  await mapper.generateDiagnosticReport(outPath);
}

// Since we are running this with TSX or node ESM, check import.meta.url
import { pathToFileURL } from 'url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  executeDryRun().catch(() => process.exit(1));
}
