export interface NormalizedTeam {
  team_id: string;
  abbreviation: string;
  display_name: string;
  logo_url: string | null;
}

export interface NormalizedMatch {
  event_id: string;
  match_date: string;
  home_team_id: string;
  away_team_id: string;
}

export interface NormalizedPlayer {
  player_id: string;
  team_id: string;
  full_name: string;
  position: string | null;
  jersey_number: string | null;
  is_active: boolean;
}

export interface NormalizedInjury {
  player_id: string;
  team_id: string;
  status: string;
  date: string;
  detail: string | null;
}

export class EspnWorldCupMapper {
  /**
   * Maps raw ESPN team payload to normalized schema.
   */
  mapTeams(rawPayload: any): NormalizedTeam[] {
    if (!rawPayload?.sports?.[0]?.leagues?.[0]?.teams) return [];
    
    return rawPayload.sports[0].leagues[0].teams.reduce((acc: NormalizedTeam[], t: any) => {
      const team = t?.team;
      if (!team?.id) return acc;

      acc.push({
        team_id: team.id,
        abbreviation: team.abbreviation ?? '',
        display_name: team.displayName ?? '',
        logo_url: team.logos?.[0]?.href ?? null
      });
      return acc;
    }, []);
  }

  /**
   * Maps raw ESPN scoreboard payload to normalized match schema.
   */
  mapMatches(rawPayload: any): NormalizedMatch[] {
    if (!rawPayload?.events) return [];

    return rawPayload.events.reduce((acc: NormalizedMatch[], event: any) => {
      if (!event?.id) return acc;

      const competitors = event?.competitions?.[0]?.competitors ?? [];
      const homeTeam = competitors.find((c: any) => c?.homeAway === 'home');
      const awayTeam = competitors.find((c: any) => c?.homeAway === 'away');

      if (!homeTeam?.team?.id || !awayTeam?.team?.id) return acc;

      acc.push({
        event_id: event.id,
        match_date: event.date ?? '',
        home_team_id: homeTeam.team.id,
        away_team_id: awayTeam.team.id
      });
      return acc;
    }, []);
  }

  /**
   * Maps resolved deep $ref payload for team athletes.
   * Expected input: Payload from .../teams/{teamId}/athletes
   */
  mapPlayers(rawPayload: any, teamId?: string): NormalizedPlayer[] {
    // ESPN core API typically wraps collections in an 'items' array
    const items = rawPayload?.items || (Array.isArray(rawPayload) ? rawPayload : []);
    if (!items.length) return [];

    return items.reduce((acc: NormalizedPlayer[], item: any) => {
      const athlete = item?.athlete || item;
      if (!athlete?.id) return acc;

      acc.push({
        player_id: athlete.id,
        team_id: teamId || 'UNKNOWN',
        full_name: athlete.fullName ?? athlete.displayName ?? '',
        position: athlete.position?.abbreviation ?? athlete.position?.name ?? null,
        jersey_number: athlete.jersey ?? null,
        is_active: athlete.active ?? true
      });
      return acc;
    }, []);
  }

  /**
   * Maps resolved deep $ref payload for team injuries.
   * Expected input: Payload from .../teams/{teamId}/injuries
   */
  mapInjuries(rawPayload: any, teamId?: string): NormalizedInjury[] {
    const items = rawPayload?.items || (Array.isArray(rawPayload) ? rawPayload : []);
    if (!items.length) return [];

    return items.reduce((acc: NormalizedInjury[], injury: any) => {
      const playerId = injury?.athlete?.id || injury?.id;
      if (!playerId) return acc;

      acc.push({
        player_id: playerId,
        team_id: teamId || 'UNKNOWN',
        status: injury.status ?? 'Unknown',
        date: injury.date ?? new Date().toISOString(),
        detail: injury.shortComment ?? injury.detail ?? null
      });
      return acc;
    }, []);
  }
}
