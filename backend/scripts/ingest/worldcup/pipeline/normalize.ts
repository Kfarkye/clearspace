// pipeline module: normalize.ts
import { Team } from '../schemas/team.schema.js';
import { Player } from '../schemas/player.schema.js';
import { Match } from '../schemas/match.schema.js';
import { Venue } from '../schemas/venue.schema.js';
import { Odds } from '../schemas/odds.schema.js';
import { FieldProvenance } from '../schemas/source.schema.js';

export interface NormalizedEntity {
  entityType: 'team' | 'player' | 'match' | 'venue' | 'odds';
  entityId: string;
  fields: Record<string, any>;
  provenance: Record<string, FieldProvenance>;
}

export function executeNormalize(parsedData: {
  teams: Team[];
  players: Player[];
  matches: Match[];
  venues: Venue[];
  oddsList: Odds[];
}): NormalizedEntity[] {
  console.log('🔄 [Pipeline: Normalize] Wrapping entities with field-level provenance...');

  const normalized: NormalizedEntity[] = [];
  const timestamp = new Date().toISOString();

  // 1. Teams (Tier 3: Enriched from TheDrip)
  parsedData.teams.forEach(t => {
    const fields: Record<string, any> = { ...t };
    const provenance: Record<string, FieldProvenance> = {};

    Object.keys(fields).forEach(key => {
      provenance[key] = {
        sourceUrl: `https://thedrip.to/teams/${t.team_code.toLowerCase()}/`,
        sourceName: 'TheDrip.to',
        fetchedAt: timestamp,
        parserVersion: 'team-profile-v1.0',
        confidence: key === 'name' || key === 'team_code' ? 0.95 : 0.86,
        status: key === 'name' ? 'verified' : 'enriched',
      };
    });

    normalized.push({
      entityType: 'team',
      entityId: t.team_code,
      fields,
      provenance,
    });
  });

  // 2. Players (Tier 3: Enriched Roster)
  parsedData.players.forEach(p => {
    const fields: Record<string, any> = { ...p };
    const provenance: Record<string, FieldProvenance> = {};

    Object.keys(fields).forEach(key => {
      provenance[key] = {
        sourceUrl: `https://thedrip.to/teams/${p.team_code.toLowerCase()}/`,
        sourceName: 'TheDrip.to Roster Extract',
        fetchedAt: timestamp,
        parserVersion: 'roster-extract-v1.0',
        confidence: 0.75, // Roster layer is non-final, lower confidence
        status: 'inferred',
      };
    });

    normalized.push({
      entityType: 'player',
      entityId: p.player_id,
      fields,
      provenance,
    });
  });

  // 3. Venues (Tier 1: Canonical Stadium Facts)
  parsedData.venues.forEach(v => {
    const fields: Record<string, any> = { ...v };
    const provenance: Record<string, FieldProvenance> = {};

    Object.keys(fields).forEach(key => {
      provenance[key] = {
        sourceUrl: 'https://fifa.com/worldcup2026/venues',
        sourceName: 'FIFA Official Host Registry',
        fetchedAt: timestamp,
        parserVersion: 'venue-facts-v1.0',
        confidence: 1.0, // Canonical source
        status: 'verified',
      };
    });

    normalized.push({
      entityType: 'venue',
      entityId: v.venue_id,
      fields,
      provenance,
    });
  });

  // 4. Matches (Tier 1: Canonical Schedule)
  parsedData.matches.forEach(m => {
    const fields: Record<string, any> = { ...m };
    const provenance: Record<string, FieldProvenance> = {};

    Object.keys(fields).forEach(key => {
      provenance[key] = {
        sourceUrl: 'https://fifa.com/worldcup2026/schedule',
        sourceName: 'FIFA Official Fixtures Schedule',
        fetchedAt: timestamp,
        parserVersion: 'match-fixtures-v1.0',
        confidence: 1.0, // Canonical backbone
        status: 'verified',
      };
    });

    normalized.push({
      entityType: 'match',
      entityId: m.match_id,
      fields,
      provenance,
    });
  });

  // 5. Odds (Tier 3: Aggregated Market Snapshots)
  parsedData.oddsList.forEach(o => {
    const fields: Record<string, any> = { ...o };
    const provenance: Record<string, FieldProvenance> = {};

    Object.keys(fields).forEach(key => {
      provenance[key] = {
        sourceUrl: `https://sportsbook.draftkings.com/world-cup-2026`,
        sourceName: o.source.toUpperCase(),
        fetchedAt: timestamp,
        parserVersion: 'odds-parser-v1.0',
        confidence: 0.90, // Market quote
        status: 'enriched',
      };
    });

    normalized.push({
      entityType: 'odds',
      entityId: o.odds_id,
      fields,
      provenance,
    });
  });

  console.log(`✅ [Pipeline: Normalize] Created ${normalized.length} normalized entities.`);
  return normalized;
}
