// ============================================================================
// Win Probability Handler — ported from aura-live
// Fetches play-by-play win probability data for a specific game
// ============================================================================

const LEAGUE_SPORT_MAP = {
  nba: 'basketball', wnba: 'basketball',
  nfl: 'football', mlb: 'baseball',
  nhl: 'hockey', mls: 'soccer', epl: 'soccer',
};

export async function handleWinProbabilityQuery(params) {
  const { team, league } = params;
  const sport = LEAGUE_SPORT_MAP[league] || 'baseball';
  const l = league || 'mlb';

  let gameId = '';
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${l}/scoreboard`;
    const res = await fetch(url);
    const data = await res.json();
    const event = data.events.find(e =>
      e.name.toLowerCase().includes(team.toLowerCase()) ||
      e.shortName.toLowerCase().includes(team.toLowerCase()) ||
      e.competitions[0].competitors.some(c =>
        c.team.abbreviation.toLowerCase() === team.toLowerCase() ||
        c.team.name.toLowerCase().includes(team.toLowerCase())
      )
    );
    if (event) { gameId = event.id; }
    else { throw new Error('No active/recent game found for that team'); }
  } catch (e) {
    return { id: `evt_wp_err_${Date.now()}`, type: 'SYSTEM_MESSAGE', resolution_state: 'GROUNDING_FAULT',
      context_summary: `Win probability failed (no game found): ${e.message}` };
  }

  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${l}/summary?event=${gameId}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch ESPN summary');
    const data = await response.json();
    const comps = data.header?.competitions?.[0];
    if (!comps || !data.winprobability) throw new Error('Win probability not available');

    const homeComp = comps.competitors.find(c => c.homeAway === 'home');
    const awayComp = comps.competitors.find(c => c.homeAway === 'away');
    const plays = data.plays || [];
    const playMap = new Map(plays.map(p => [p.id, p.text]));

    return {
      id: `evt_wp_${Date.now()}`,
      type: 'WIN_PROBABILITY_ARTIFACT',
      resolution_state: 'LIVE_DATA',
      data: {
        gameId,
        homeTeam: { name: homeComp.team.name, abbreviation: homeComp.team.abbreviation,
          color: homeComp.team.color || '#ffffff', logo: homeComp.team.logos?.[0]?.href || '' },
        awayTeam: { name: awayComp.team.name, abbreviation: awayComp.team.abbreviation,
          color: awayComp.team.color || '#ffffff', logo: awayComp.team.logos?.[0]?.href || '' },
        probabilities: data.winprobability.map(wp => ({
          playId: wp.playId,
          homeWinPercentage: wp.homeWinPercentage * 100,
          awayWinPercentage: (1 - wp.homeWinPercentage) * 100,
          playDescription: playMap.get(wp.playId) || '',
        })),
      },
    };
  } catch (e) {
    return { id: `evt_wp_err_${Date.now()}`, type: 'SYSTEM_MESSAGE', resolution_state: 'GROUNDING_FAULT',
      context_summary: `Could not fetch win probability: ${e.message}` };
  }
}
