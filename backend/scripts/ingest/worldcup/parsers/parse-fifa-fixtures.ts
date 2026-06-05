// parser module: parse-fifa-fixtures.ts
import { Match } from '../schemas/match.schema.js';

interface RawFifaMatch {
  match_number: number;
  group_letter: string;
  home_team: string;
  away_team: string;
  venue_name: string;
  kickoff_date: string;
  kickoff_time: string;
  stage: string;
}

export function parseFifaFixtures(rawJson: string): Match[] {
  const parsed = JSON.parse(rawJson);
  const rawMatches: RawFifaMatch[] = parsed.matches || [];

  return rawMatches.map(m => {
    // Generate a deterministic UUID or ID based on match number to ensure stability
    const matchId = `match-2026-no-${m.match_number}`;

    // Normalize kickoff ISO timestamp
    const kickoffIso = new Date(`${m.kickoff_date}T${m.kickoff_time}Z`).toISOString();

    return {
      match_id: matchId,
      group_letter: m.group_letter,
      match_number: m.match_number,
      home_team_code: m.home_team,
      away_team_code: m.away_team,
      venue_id: m.venue_name, // Temporarily map name as ID, pipeline will resolve it to venue_id
      kickoff: kickoffIso,
      stage: m.stage,
      status: 'scheduled',
    };
  });
}
