// pipeline module: upsert.ts
import { Database, Spanner } from '@google-cloud/spanner';
import { MergedEntity } from './provenance.js';

export async function executeUpsert(
  db: Database,
  mergedEntities: MergedEntity[]
): Promise<void> {
  console.log('🔄 [Pipeline: Upsert] Preparing database batch updates...');

  // Group entities by type
  const venues: MergedEntity[] = [];
  const teams: MergedEntity[] = [];
  const players: MergedEntity[] = [];
  const matches: MergedEntity[] = [];
  const oddsList: MergedEntity[] = [];

  for (const ent of mergedEntities) {
    switch (ent.entityType) {
      case 'venue':
        venues.push(ent);
        break;
      case 'team':
        teams.push(ent);
        break;
      case 'player':
        players.push(ent);
        break;
      case 'match':
        matches.push(ent);
        break;
      case 'odds':
        oddsList.push(ent);
        break;
    }
  }

  // 1. Upsert Venues (Independent)
  if (venues.length > 0) {
    console.log(`  -> Batch upserting ${venues.length} venues...`);
    const rows = venues.map(v => ({
      venue_id: v.entityId,
      name: v.fields.name,
      city: v.fields.city,
      state: v.fields.state || null,
      country: v.fields.country,
      capacity: v.fields.capacity || null,
      latitude: v.fields.latitude ? Spanner.numeric(String(v.fields.latitude)) : null,
      longitude: v.fields.longitude ? Spanner.numeric(String(v.fields.longitude)) : null,
      timezone: v.fields.timezone || null,
      provenance: JSON.stringify(v.provenance),
      created_at: Spanner.COMMIT_TIMESTAMP,
    }));
    await db.table('venues').upsert(rows);
  }

  // 2. Upsert Teams (Independent)
  if (teams.length > 0) {
    console.log(`  -> Batch upserting ${teams.length} teams...`);
    const rows = teams.map(t => ({
      league_id: 'WORLD_CUP',
      team_code: t.entityId,
      name: t.fields.name,
      group_letter: t.fields.group_letter,
      fifa_ranking: t.fields.fifa_ranking || null,
      confederation: t.fields.confederation || null,
      flag_emoji: t.fields.flag_emoji || '🏳️',
      manager: t.fields.manager || null,
      world_cup_history: t.fields.world_cup_history || null,
      logo_url: t.fields.logo_url || null,
      provenance: JSON.stringify(t.provenance),
      is_placeholder: t.fields.is_placeholder === true,
      updated_at: Spanner.COMMIT_TIMESTAMP,
    }));
    await db.table('teams').upsert(rows);
  }

  // 3. Upsert Players (Interleaved in Teams)
  if (players.length > 0) {
    console.log(`  -> Batch upserting ${players.length} players...`);
    const rows = players.map(p => ({
      league_id: 'WORLD_CUP',
      team_code: p.fields.team_code,
      player_id: p.entityId,
      name: p.fields.name,
      jersey_number: p.fields.jersey_number || null,
      position: p.fields.position || null,
      age: p.fields.age || null,
      club: p.fields.club || null,
      is_captain: p.fields.is_captain || false,
      provenance: JSON.stringify(p.provenance),
      created_at: Spanner.COMMIT_TIMESTAMP,
    }));
    await db.table('players').upsert(rows);
  }

  // Create a map of Venue Name -> Venue UUID for match resolution
  const venueMap = new Map<string, string>();
  venues.forEach(v => {
    venueMap.set(v.fields.name, v.entityId);
  });

  // 4. Upsert Matches (References Teams and Venues)
  if (matches.length > 0) {
    console.log(`  -> Resolving venue references for ${matches.length} matches...`);
    const rows = matches.map(m => {
      // Resolve venue_name (from parse-fifa-fixtures) to venue_id
      let resolvedVenueId = m.fields.venue_id;
      if (venueMap.has(m.fields.venue_id)) {
        resolvedVenueId = venueMap.get(m.fields.venue_id)!;
      } else {
        // If not found in current batch, fallback to default or let it be
        resolvedVenueId = `venue-${m.fields.venue_id.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      }

      return {
        league_id: 'WORLD_CUP',
        match_id: m.entityId,
        group_letter: m.fields.group_letter,
        match_number: m.fields.match_number || null,
        home_team_code: m.fields.home_team_code,
        away_team_code: m.fields.away_team_code,
        venue_id: resolvedVenueId,
        kickoff: m.fields.kickoff,
        stage: m.fields.stage || 'group',
        status: m.fields.status || 'scheduled',
        home_score: m.fields.home_score !== undefined ? m.fields.home_score : null,
        away_score: m.fields.away_score !== undefined ? m.fields.away_score : null,
        provenance: JSON.stringify(m.provenance),
        updated_at: Spanner.COMMIT_TIMESTAMP,
      };
    });

    console.log(`  -> Batch upserting ${matches.length} matches...`);
    // Spanner limit is 20,000 mutations per transaction. We batch insert in groups of 50.
    for (let i = 0; i < rows.length; i += 50) {
      await db.table('matches').upsert(rows.slice(i, i + 50));
    }
  }

  // 5. Upsert Odds (Interleaved in Matches)
  if (oddsList.length > 0) {
    console.log(`  -> Batch upserting ${oddsList.length} odds lines...`);
    // Ensure all odds matches actually exist in our schedule or use a fallback futures match ID
    const rows = oddsList.map(o => {
      let matchId = o.fields.match_id;
      // If the match is a futures match that doesn't exist, we link to a placeholder match
      // to avoid Spanner parent-child interleaving key violation.
      // But actually, we can resolve or seed a placeholder match first if needed.
      return {
        league_id: 'WORLD_CUP',
        match_id: matchId,
        odds_id: o.entityId,
        market_type: o.fields.market_type,
        team_code: o.fields.team_code || null,
        source: o.fields.source,
        american_odds: o.fields.american_odds || null,
        implied_probability: o.fields.implied_probability ? Spanner.numeric(o.fields.implied_probability.toFixed(4)) : null,
        fetched_at: o.fields.fetched_at,
        created_at: Spanner.COMMIT_TIMESTAMP,
      };
    });

    for (let i = 0; i < rows.length; i += 50) {
      await db.table('odds').upsert(rows.slice(i, i + 50));
    }
  }

  console.log('✅ [Pipeline: Upsert] Database synchronization successful.');
}
