import { ESPN_SPORT_MAP as SHARED_ESPN_SPORT_MAP, resolveRef as sharedResolveRef, fetchCoreApiOdds } from '@clearspace/sports-core';
import * as sportsDAL from '../lib/sports-dal.js';
import { handleSportsQuery } from '../lib/sports-handler.js';
import { handleWinProbabilityQuery } from '../lib/win-probability-handler.js';
import { handlePlayerPropQuery } from '../lib/player-prop-handler.js';
import { fetchDataTable } from '../lib/data-table-agent.js';
import { z } from 'zod';

const ESPN_SPORT_MAP = SHARED_ESPN_SPORT_MAP;
const resolveRef = sharedResolveRef;

// --- ESPN Response Cache (60s TTL) ---
const espnCache = new Map();
const ESPN_CACHE_TTL_MS = 60_000; // 60 seconds

function getCachedOrFetch(cacheKey, fetchFn) {
  const cached = espnCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < ESPN_CACHE_TTL_MS) {
    console.log(`[ESPN Cache] HIT: ${cacheKey}`);
    // P3 FIX: True LRU behavior — re-insert on hit to bump to tail
    espnCache.delete(cacheKey);
    espnCache.set(cacheKey, cached);
    return { data: cached.data, fromCache: true };
  }
  return { data: null, fromCache: false };
}

function setCache(cacheKey, data) {
  espnCache.set(cacheKey, { data, timestamp: Date.now() });
  // Evict oldest entries (maintain LRU order)
  if (espnCache.size > 100) {
    const oldest = espnCache.keys().next().value;
    espnCache.delete(oldest);
  }
}

export const espnScoreboard = async (req, res) => {
  const { sport } = req.params;
  const { date } = req.query;

  // Validate date format if provided (YYYYMMDD only)
  if (date && !/^\d{8}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYYMMDD (e.g., 20260531).' });
  }

  const mapping = ESPN_SPORT_MAP[sport.toLowerCase()];
  if (!mapping) {
    return res.status(400).json({ error: `Unknown sport: ${sport}. Supported: ${Object.keys(ESPN_SPORT_MAP).join(', ')}` });
  }

  const dateParam = date ? `?dates=${date}` : '';

  // Fetch both APIs in parallel
  const siteUrl = `https://site.api.espn.com/apis/site/v2/sports/${mapping.site}/scoreboard${dateParam}`;
  const coreUrl = `https://sports.core.api.espn.com/v2/sports/${mapping.core}/leagues/${mapping.league}/events${dateParam}&limit=100`;

  console.log(`[ESPN Proxy] Site: ${siteUrl}`);
  console.log(`[ESPN Proxy] Core: ${coreUrl}`);

  try {
    // Check cache first
    const cacheKey = `scoreboard:${sport}:${date || 'today'}`;
    const { data: cachedData, fromCache } = getCachedOrFetch(cacheKey);
    if (fromCache) {
      return res.json({ ...cachedData, _cached: true });
    }

    const [siteRes, coreRes] = await Promise.all([
      fetch(siteUrl, { signal: AbortSignal.timeout(8000) }),
      fetch(coreUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null)
    ]);

    if (!siteRes.ok) {
      return res.status(siteRes.status).json({ error: `ESPN Site API returned ${siteRes.status}` });
    }

    const siteData = await siteRes.json();
    
    // Parse core API event refs for odds enrichment
    let coreEventsMap = {};
    if (coreRes && coreRes.ok) {
      try {
        const coreData = await coreRes.json();
        const coreItems = coreData.items || [];
        
        // Resolve event refs in parallel (cap at 15 to avoid hammering)
        const eventRefs = coreItems.slice(0, 15).map(item => item.$ref).filter(Boolean);
        const resolvedEvents = await Promise.all(eventRefs.map(ref => resolveRef(ref)));
        
        for (const evt of resolvedEvents) {
          if (evt && evt.id) {
            coreEventsMap[evt.id] = evt;
          }
        }
      } catch (e) {
        console.warn('[ESPN Proxy] Core API parse warning:', e.message);
      }
    }

    // Build enriched response — resolve Core API odds for in-progress games
    const events = await Promise.all((siteData.events || []).map(async (evt) => {
      const comp = evt.competitions?.[0] || {};
      const coreEvt = coreEventsMap[evt.id];
      const coreComp = coreEvt?.competitions?.[0];

      // Teams from site API
      const teams = (comp.competitors || []).map((c) => ({
        name: c.team?.displayName || c.team?.name || 'Unknown',
        abbreviation: c.team?.abbreviation || '',
        score: c.score || '0',
        homeAway: c.homeAway,
        logo: c.team?.logo || '',
        record: c.records?.[0]?.summary || '',
        winner: c.winner || false,
      }));

      // Odds from site API (partial — often has overUnder but no moneyLine for scheduled games)
      const siteOdds = comp.odds?.[0] || {};

      // Core API odds — delegated to shared @clearspace/sports-core
      const isLive = (comp.status?.type?.description || '') === 'In Progress';
      let coreOdds = await fetchCoreApiOdds({
        sport: sport.toLowerCase(),
        eventId: evt.id,
        competitionId: comp.id || evt.id,
        isLive,
      });
      if (coreOdds) {
        // Add homeLine/awayLine nulls for backward compat with existing frontend
        coreOdds = { ...coreOdds, homeLine: null, awayLine: null };
        console.log(`[ESPN Proxy] Core API odds resolved for event ${evt.id} (${isLive ? 'LIVE' : 'pre'}): provider=${coreOdds.provider}, ML=${coreOdds.awayMoneyline}/${coreOdds.homeMoneyline}, spread=${coreOdds.spread}, O/U=${coreOdds.overUnder}`);
      }

      // Resolve predictor (win probability) from Core API if available
      let predictor = null;
      if (coreComp?.predictor?.$ref) {
        try {
          const predData = await resolveRef(coreComp.predictor.$ref, 2000);
          if (predData) {
            predictor = {
              homeWinPct: predData.homeTeam?.gameProjection || null,
              awayWinPct: predData.awayTeam?.gameProjection || null,
            };
          }
        } catch (e) {
          // Predictor is optional, silently fail
        }
      }

      // Status
      const status = comp.status || {};

      // Merge odds: prefer Core API (complete), fall back to site API (partial)
      const finalOdds = coreOdds ? {
        ...coreOdds,
        source: (comp.status?.type?.description === 'In Progress') ? 'live_core' : 'core',
      } : (siteOdds.overUnder || siteOdds.details) ? {
        provider: siteOdds.provider?.name || '',
        spread: siteOdds.details || '',
        overUnder: siteOdds.overUnder || null,
        homeMoneyline: siteOdds.homeTeamOdds?.moneyLine || null,
        awayMoneyline: siteOdds.awayTeamOdds?.moneyLine || null,
        homeLine: siteOdds.homeTeamOdds?.spreadOdds || null,
        awayLine: siteOdds.awayTeamOdds?.spreadOdds || null,
        source: 'site_fallback',
      } : {
        provider: '',
        spread: '',
        overUnder: null,
        homeMoneyline: null,
        awayMoneyline: null,
        homeLine: null,
        awayLine: null,
        source: 'none',
      };

      return {
        id: evt.id,
        name: evt.name || evt.shortName,
        shortName: evt.shortName,
        date: evt.date,
        status: status.type?.description || 'Scheduled',
        detail: status.type?.detail || status.detail || '',
        period: status.period || 0,
        clock: status.displayClock || '',
        venue: comp.venue?.fullName || '',
        city: comp.venue?.address?.city || '',
        broadcast: comp.broadcasts?.[0]?.names?.[0] || '',
        teams,
        odds: finalOdds,
        predictor,
        // Leaders / top performers (if available from site API)
        leaders: (comp.leaders || []).map(cat => ({
          category: cat.name,
          leader: cat.leaders?.[0]?.athlete?.displayName || '',
          value: cat.leaders?.[0]?.displayValue || '',
        })),
      };
    }));

    const responsePayload = {
      sport: sport.toUpperCase(),
      league: siteData.leagues?.[0]?.name || sport.toUpperCase(),
      date: date || new Date().toISOString().split('T')[0],
      count: events.length,
      source: 'espn_site+core',
      events,
    };

    // Cache the response
    setCache(cacheKey, responsePayload);

    res.json(responsePayload);
  } catch (err) {
    console.error('[ESPN Proxy] Error:', err);
    res.status(500).json({ error: 'Failed to fetch ESPN data' });
  }
};

export const espnEventDetail = async (req, res) => {
  const { sport, eventId } = req.params;
  const mapping = ESPN_SPORT_MAP[sport.toLowerCase()];
  if (!mapping) {
    return res.status(400).json({ error: `Unknown sport: ${sport}` });
  }

  const coreEventUrl = `https://sports.core.api.espn.com/v2/sports/${mapping.core}/leagues/${mapping.league}/events/${eventId}`;
  console.log(`[ESPN Core] Fetching event detail: ${coreEventUrl}`);

  try {
    const eventData = await resolveRef(coreEventUrl, 5000);
    if (!eventData) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Resolve competitions, odds, and predictor in parallel
    const comp = eventData.competitions?.[0];
    const resolveTargets = {};
    
    if (comp) {
      if (comp.odds?.$ref) resolveTargets.odds = resolveRef(comp.odds.$ref);
      if (comp.predictor?.$ref) resolveTargets.predictor = resolveRef(comp.predictor.$ref);
      if (comp.status?.$ref) resolveTargets.status = resolveRef(comp.status.$ref);
      // Resolve competitors
      if (comp.competitors) {
        resolveTargets.competitors = Promise.all(
          comp.competitors.map(c => c.$ref ? resolveRef(c.$ref) : Promise.resolve(c))
        );
      }
    }

    const keys = Object.keys(resolveTargets);
    const values = await Promise.all(Object.values(resolveTargets));
    const resolved = {};
    keys.forEach((k, i) => resolved[k] = values[i]);

    // Parse odds array
    let oddsData = [];
    if (resolved.odds?.items) {
      const oddsItems = await Promise.all(
        resolved.odds.items.slice(0, 3).map(item => item.$ref ? resolveRef(item.$ref) : Promise.resolve(item))
      );
      oddsData = oddsItems.filter(Boolean).map(o => ({
        provider: o.provider?.name || '',
        spread: o.spread || null,
        overUnder: o.overUnder || null,
        homeMoneyline: o.homeTeamOdds?.moneyLine || null,
        awayMoneyline: o.awayTeamOdds?.moneyLine || null,
        homeSpreadOdds: o.homeTeamOdds?.spreadOdds || null,
        awaySpreadOdds: o.awayTeamOdds?.spreadOdds || null,
      }));
    }

    // Parse competitors
    const teams = (resolved.competitors || []).filter(Boolean).map(c => ({
      name: c.team?.displayName || c.team?.name || 'Unknown',
      abbreviation: c.team?.abbreviation || '',
      score: c.score?.displayValue || c.score || '0',
      homeAway: c.homeAway,
      record: c.record?.displayValue || '',
      logo: c.team?.logos?.[0]?.href || '',
    }));

    // Predictor (win probability)
    const predictor = resolved.predictor ? {
      homeWinPct: resolved.predictor.homeTeam?.gameProjection || null,
      awayWinPct: resolved.predictor.awayTeam?.gameProjection || null,
    } : null;

    res.json({
      id: eventData.id,
      name: eventData.name,
      date: eventData.date,
      status: resolved.status?.type?.description || eventData.status?.type?.description || 'Unknown',
      detail: resolved.status?.type?.detail || '',
      teams,
      odds: oddsData,
      predictor,
      source: 'espn_core_v2',
    });
  } catch (err) {
    console.error('[ESPN Core] Error:', err);
    res.status(500).json({ error: 'Failed to fetch event detail' });
  }
};

export const espnEventPlays = async (req, res) => {
  const { sport, eventId } = req.params;
  const mapping = ESPN_SPORT_MAP[sport.toLowerCase()];
  if (!mapping) {
    return res.status(400).json({ error: `Unknown sport: ${sport}` });
  }

  const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/${mapping.site}/summary?event=${eventId}`;
  console.log(`[ESPN PBP] Fetching summary: ${summaryUrl}`);

  try {
    const pbpRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(6000) });
    if (!pbpRes.ok) {
      return res.status(pbpRes.status).json({ error: `ESPN summary returned ${pbpRes.status}` });
    }

    const data = await pbpRes.json();

    // Build player ID → name lookup from rosters
    const playerMap = {};
    for (const team of (data.rosters || [])) {
      for (const entry of (team.roster || [])) {
        // ESPN rosters use entry.athlete.id + entry.athlete.fullName
        const a = entry.athlete;
        if (a?.id) {
          playerMap[a.id] = a.displayName || a.fullName || a.shortName || '';
        }
        // Fallback: some formats use entry.playerId
        if (entry.playerId && entry.displayName) {
          playerMap[entry.playerId] = entry.displayName;
        }
      }
    }

    // Also build from boxscore players
    for (const team of (data.boxscore?.players || [])) {
      for (const statGroup of (team.statistics || [])) {
        for (const athlete of (statGroup.athletes || [])) {
          const a = athlete.athlete;
          if (a?.id) {
            playerMap[a.id] = a.displayName || a.fullName || a.shortName || '';
          }
        }
      }
    }

    // Extract situation with resolved player names
    const sit = data.situation || {};
    const batterId = sit.batter?.playerId || sit.batter?.id;
    const pitcherId = sit.pitcher?.playerId || sit.pitcher?.id;

    const situation = {
      balls: sit.balls ?? null,
      strikes: sit.strikes ?? null,
      outs: sit.outs ?? null,
      onFirst: !!sit.onFirst,
      onSecond: !!sit.onSecond,
      onThird: !!sit.onThird,
      batter: batterId ? (playerMap[batterId] || `Player #${batterId}`) : null,
      pitcher: pitcherId ? (playerMap[pitcherId] || `Player #${pitcherId}`) : null,
    };

    // Recent plays from the plays array
    const allPlays = Array.isArray(data.plays) ? data.plays : [];
    const recentPlays = allPlays.slice(-10).reverse().map(play => ({
      text: play.text || play.description || '',
      type: play.type?.text || '',
      awayScore: play.awayScore ?? null,
      homeScore: play.homeScore ?? null,
    }));

    // Last completed play
    const lastPlayRaw = sit.lastPlay?.id
      ? allPlays.find(p => p.id === sit.lastPlay.id)
      : allPlays[allPlays.length - 1];

    // Extract completed at-bat results from plays (atBats in ESPN is a dict of refs, not usable directly)
    const atBatEndTypes = ['Strikeout', 'Walk', 'Single', 'Double', 'Triple', 'Home Run', 'Flyout', 'Groundout', 'Lineout', 'Pop Out', 'Force Out', 'Sac Fly', 'Sac Bunt', 'Hit By Pitch', 'Double Play', 'Field Error'];
    const completedAtBats = allPlays
      .filter(p => p.type?.text && atBatEndTypes.some(t => p.type.text.includes(t)))
      .slice(-5)
      .reverse()
      .map(p => ({
        result: p.type?.text || '',
        text: p.text || '',
        awayScore: p.awayScore ?? null,
        homeScore: p.homeScore ?? null,
      }));

    // Odds from pickcenter (if available in summary)
    const pickcenterOdds = (data.pickcenter || []).slice(0, 3).map(pc => ({
      provider: pc.provider?.name || '',
      spread: pc.details || '',
      overUnder: pc.overUnder || null,
      homeMoneyline: pc.homeTeamOdds?.moneyLine || null,
      awayMoneyline: pc.awayTeamOdds?.moneyLine || null,
    }));

    // Win probability (if available)
    const winProb = data.winprobability
      ? data.winprobability[data.winprobability.length - 1]
      : null;

    res.json({
      eventId,
      sport: sport.toUpperCase(),
      situation,
      lastPlay: lastPlayRaw ? {
        text: lastPlayRaw.text || lastPlayRaw.description || '',
        type: lastPlayRaw.type?.text || '',
        awayScore: lastPlayRaw.awayScore,
        homeScore: lastPlayRaw.homeScore,
      } : null,
      recentPlays,
      completedAtBats,
      odds: pickcenterOdds,
      winProbability: winProb ? {
        homeWinPct: winProb.homeWinPercentage ?? null,
        awayWinPct: winProb.awayWinPercentage ?? null,
        playId: winProb.playId || null,
      } : null,
      source: 'espn_summary',
    });
  } catch (err) {
    console.error('[ESPN PBP] Error:', err);
    res.status(500).json({ error: 'Failed to fetch play-by-play data' });
  }
};

const ODDS_API_SPORT_MAP = {
  mlb: 'baseball_mlb',
  nba: 'basketball_nba',
  nfl: 'americanfootball_nfl',
  nhl: 'icehockey_nhl',
  wnba: 'basketball_wnba',
  mls: 'soccer_usa_mls',
  epl: 'soccer_epl',
  liga: 'soccer_spain_la_liga',
  ucl: 'soccer_uefa_champs_league',
  cfb: 'americanfootball_ncaaf',
  cbb: 'basketball_ncaab',
};

export const oddsApiOdds = async (req, res) => {
  const { sport } = req.params;
  const oddsApiKey = process.env.ODDS_API_KEY;

  if (!oddsApiKey) {
    return res.status(200).json({
      configured: false,
      error: 'Odds API key not configured',
      setup: 'Add ODDS_API_KEY=your_key to .env to enable live multi-book odds from The Odds API.',
      events: [],
    });
  }

  const oddsSport = ODDS_API_SPORT_MAP[sport.toLowerCase()];
  if (!oddsSport) {
    return res.status(400).json({ error: `No Odds API mapping for sport: ${sport}` });
  }

  const oddsUrl = `https://api.the-odds-api.com/v4/sports/${oddsSport}/odds/?apiKey=${oddsApiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&includeLinks=true&includeSids=true`;
  console.log(`[Odds API] Fetching: ${oddsSport}`);

  try {
    const oddsRes = await fetch(oddsUrl, { signal: AbortSignal.timeout(5000) });
    if (!oddsRes.ok) {
      const remaining = oddsRes.headers.get('x-requests-remaining');
      return res.status(oddsRes.status).json({
        error: `Odds API returned ${oddsRes.status}`,
        requestsRemaining: remaining,
      });
    }

    const oddsData = await oddsRes.json();
    const remaining = oddsRes.headers.get('x-requests-remaining');
    const used = oddsRes.headers.get('x-requests-used');

    // Normalize response
    const events = oddsData.map(game => {
      const books = (game.bookmakers || []).map(book => {
        const h2h = book.markets?.find(m => m.key === 'h2h');
        const spreads = book.markets?.find(m => m.key === 'spreads');
        const totals = book.markets?.find(m => m.key === 'totals');

        return {
          name: book.title || book.key,
          key: book.key,
          link: book.link || null,
          sid: book.sid || null,
          moneyline: {
            home: h2h?.outcomes?.find(o => o.name === game.home_team)?.price || null,
            homeLink: h2h?.outcomes?.find(o => o.name === game.home_team)?.link || null,
            homeSid: h2h?.outcomes?.find(o => o.name === game.home_team)?.sid || null,
            away: h2h?.outcomes?.find(o => o.name === game.away_team)?.price || null,
            awayLink: h2h?.outcomes?.find(o => o.name === game.away_team)?.link || null,
            awaySid: h2h?.outcomes?.find(o => o.name === game.away_team)?.sid || null,
          },
          spread: {
            home: spreads?.outcomes?.find(o => o.name === game.home_team)?.point || null,
            homeOdds: spreads?.outcomes?.find(o => o.name === game.home_team)?.price || null,
            homeLink: spreads?.outcomes?.find(o => o.name === game.home_team)?.link || null,
            homeSid: spreads?.outcomes?.find(o => o.name === game.home_team)?.sid || null,
            away: spreads?.outcomes?.find(o => o.name === game.away_team)?.point || null,
            awayOdds: spreads?.outcomes?.find(o => o.name === game.away_team)?.price || null,
            awayLink: spreads?.outcomes?.find(o => o.name === game.away_team)?.link || null,
            awaySid: spreads?.outcomes?.find(o => o.name === game.away_team)?.sid || null,
          },
          total: {
            over: totals?.outcomes?.find(o => o.name === 'Over')?.point || null,
            overOdds: totals?.outcomes?.find(o => o.name === 'Over')?.price || null,
            overLink: totals?.outcomes?.find(o => o.name === 'Over')?.link || null,
            overSid: totals?.outcomes?.find(o => o.name === 'Over')?.sid || null,
            under: totals?.outcomes?.find(o => o.name === 'Under')?.point || null,
            underOdds: totals?.outcomes?.find(o => o.name === 'Under')?.price || null,
            underLink: totals?.outcomes?.find(o => o.name === 'Under')?.link || null,
            underSid: totals?.outcomes?.find(o => o.name === 'Under')?.sid || null,
          },
        };
      });

      return {
        id: game.id,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        commenceTime: game.commence_time,
        books,
      };
    });

    res.json({
      configured: true,
      sport: sport.toUpperCase(),
      count: events.length,
      requestsRemaining: remaining,
      requestsUsed: used,
      events,
      source: 'the_odds_api',
    });
  } catch (err) {
    console.error('[Odds API] Error:', err);
    res.status(500).json({ error: 'Failed to fetch odds data' });
  }
};

export const intelligenceSportsQuery = async (req, res) => {
  try {
    const result = await handleSportsQuery(req.body);
    res.json(result);
  } catch (e) {
    console.error('[Intelligence:Sports] Error:', e);
    res.status(500).json({ error: e.message });
  }
};

export const intelligenceWinProbability = async (req, res) => {
  try {
    const result = await handleWinProbabilityQuery(req.body);
    res.json(result);
  } catch (e) {
    console.error('[Intelligence:WinProb] Error:', e);
    res.status(500).json({ error: e.message });
  }
};

export const intelligencePlayerProps = async (req, res) => {
  try {
    const result = await handlePlayerPropQuery(req.body);
    res.json(result);
  } catch (e) {
    console.error('[Intelligence:Props] Error:', e);
    res.status(500).json({ error: e.message });
  }
};

export const intelligenceDataTable = async (req, res) => {
  try {
    const result = await fetchDataTable(req.body.query);
    res.json(result);
  } catch (e) {
    console.error('[Intelligence:DataTable] Error:', e);
    res.status(500).json({ error: e.message });
  }
};

export const getLeagues = async (req, res) => {
  try {
    const leagues = await sportsDAL.getLeagues();
    res.json({ leagues });
  } catch (e) {
    console.error('[Sports:Leagues] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
};

export const getTeams = async (req, res) => {
  try {
    const leagueId = req.params.league.toUpperCase();
    const includePlaceholders = req.query.includePlaceholders === 'true';
    let teams = await sportsDAL.getTeams(leagueId, req.query.group || undefined);
    if (!includePlaceholders) {
      teams = teams.filter(t => !t.isPlaceholder);
    }
    res.json({ teams });
  } catch (e) {
    console.error(`[Sports:Teams:${req.params.league}] Error:`, e.message);
    res.status(500).json({ error: e.message });
  }
};

export const getTeam = async (req, res) => {
  try {
    const team = await sportsDAL.getTeam(req.params.league.toUpperCase(), req.params.code.toUpperCase());
    if (!team) return res.status(404).json({ error: 'Team not found.' });
    res.json(team);
  } catch (e) {
    console.error(`[Sports:Team:${req.params.league}] Error:`, e.message);
    res.status(500).json({ error: e.message });
  }
};

export const getVenues = async (_req, res) => {
  try {
    const venues = await sportsDAL.getVenues();
    res.json({ venues });
  } catch (e) {
    console.error('[Sports:Venues] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
};

export const getMatches = async (req, res) => {
  try {
    const matches = await sportsDAL.getMatches(req.params.league.toUpperCase(), {
      group: req.query.group,
      stage: req.query.stage,
      team: req.query.team,
    });
    res.json({ matches });
  } catch (e) {
    console.error(`[Sports:Matches:${req.params.league}] Error:`, e.message);
    res.status(500).json({ error: e.message });
  }
};

export const getSchedule = async (req, res) => {
  try {
    const league = req.params.league.toUpperCase();
    const limit = parseInt(req.query.limit) || 5;

    try {
      const mapping = SHARED_ESPN_SPORT_MAP[league.toLowerCase()];
      if (mapping) {
        // Reuse the module-level espnCache. Key is distinct from espnScoreboard's
        // so the two endpoints' differently-shaped payloads never collide.
        const cacheKey = `schedule:${league}:today`;
        const { data: cachedData, fromCache } = getCachedOrFetch(cacheKey);
        if (fromCache) {
          return res.json({ events: cachedData.events.slice(0, limit), _cached: true });
        }

        const siteUrl = `https://site.api.espn.com/apis/site/v2/sports/${mapping.site}/scoreboard`;
        const siteRes = await fetch(siteUrl, { signal: AbortSignal.timeout(5000) });

        if (siteRes.ok) {
          const siteData = await siteRes.json();
          const allEvents = (siteData.events || []).map(evt => {
            const comp = evt.competitions?.[0] || {};
            const competitors = comp.competitors || [];
            const status = evt.status || {};

            const homeRaw = competitors.find(c => c.homeAway === 'home') || competitors[0];
            const awayRaw = competitors.find(c => c.homeAway === 'away') || competitors[1];

            const parseTeam = (raw) => {
              const parsedScore = parseInt(raw?.score, 10);
              return {
                name: raw?.team?.shortDisplayName || raw?.team?.name || 'Unknown',
                abbreviation: raw?.team?.abbreviation || 'TBD',
                record: raw?.records?.[0]?.summary || '0-0',
                score: !isNaN(parsedScore) ? parsedScore : null,
              };
            };

            const stateMap = {
              'STATUS_SCHEDULED': 'pre',
              'STATUS_IN_PROGRESS': 'in',
              'STATUS_FINAL': 'post',
              'STATUS_POSTPONED': 'off',
              'STATUS_SUSPENDED': 'off',
              'STATUS_CANCELED': 'off',
              'STATUS_DELAYED': 'off',
            };
            const statusState = stateMap[status.type?.name] || 'pre';

            const detail = status.type?.shortDetail || '';
            const periodPrefix = detail.split(' ')[0].toLowerCase(); // top | bot | mid | end

            // Board-scope live state only: inning, half, status. Bases/outs are NOT
            // reliable here — they come from the focused view's /summary call.
            let live = undefined;
            if (statusState === 'in') {
              live = {
                inning: status.period,
                inning_half: (periodPrefix === 'bot' || periodPrefix === 'end') ? 'bottom' : 'top',
              };
            }

            const oddsRaw = comp.odds?.[0] || {};
            let oddsObj = undefined;
            if (oddsRaw.homeTeamOdds?.moneyLine || oddsRaw.awayTeamOdds?.moneyLine) {
              oddsObj = {
                homeMoneyline: oddsRaw.homeTeamOdds?.moneyLine || 0,
                awayMoneyline: oddsRaw.awayTeamOdds?.moneyLine || 0,
              };
            }

            return {
              game_id: evt.id,
              short_status: detail,
              status_state: statusState,
              start_time: evt.date,
              home_team: parseTeam(homeRaw),
              away_team: parseTeam(awayRaw),
              live,
              odds: oddsObj,
            };
          });

          // Cache the full normalized set; slice per-request so different limits share one fetch.
          setCache(cacheKey, { events: allEvents });
          return res.json({ events: allEvents.slice(0, limit) });
        }
      }
    } catch (err) {
      console.warn('[getSchedule] Live ESPN scoreboard failed, falling back to DB:', err.message);
    }

    // DB fallback (unchanged)
    const matches = await sportsDAL.getMatches(league, {});
    const events = matches.slice(0, limit).map(m => ({
      game_id: m.matchId,
      short_status: m.status,
      status_state: 'pre',
      home_team: { name: m.homeTeam?.name || m.homeTeam?.code, abbreviation: m.homeTeam?.code, record: '' },
      away_team: { name: m.awayTeam?.name || m.awayTeam?.code, abbreviation: m.awayTeam?.code, record: '' },
    }));

    res.json({ events });
  } catch (e) {
    console.error(`[Sports:Schedule:${req.params.league}] Error:`, e.message);
    res.status(500).json({ error: e.message });
  }
};

export const getMatchDetail = async (req, res) => {
  try {
    const detail = await sportsDAL.getMatchDetail(req.params.league.toUpperCase(), req.params.id);
    if (!detail) return res.status(404).json({ error: 'Match not found.' });
    res.json(detail);
  } catch (e) {
    console.error(`[Sports:MatchDetail:${req.params.league}] Error:`, e.message);
    res.status(500).json({ error: e.message });
  }
};

export const getEdges = async (req, res) => {
  try {
    const edges = await sportsDAL.getEdges(req.params.league.toUpperCase(), {
      team: req.query.team,
      minEdge: req.query.minEdge ? parseFloat(req.query.minEdge) : undefined,
    });
    res.json({ edges });
  } catch (e) {
    console.error(`[Sports:Edges:${req.params.league}] Error:`, e.message);
    res.status(500).json({ error: e.message });
  }
};

export const getOdds = async (req, res) => {
  try {
    const filters = {};
    if (req.query.match_id) filters.matchId = req.query.match_id;
    if (req.query.market) filters.marketType = req.query.market;
    if (req.query.limit) {
      const parsedLimit = parseInt(req.query.limit, 10);
      if (!isNaN(parsedLimit)) filters.limit = parsedLimit;
    }
    const odds = await sportsDAL.getOdds(req.params.league.toUpperCase(), filters);
    res.json({ odds });
  } catch (e) {
    console.error(`[Sports:Odds:${req.params.league}] Error:`, e.message);
    res.status(500).json({ error: e.message });
  }
};

export const getGroupSnapshot = async (req, res) => {
  try {
    const snapshot = await sportsDAL.getGroupSnapshot(req.params.league.toUpperCase(), req.params.letter.toUpperCase());
    res.json(snapshot);
  } catch (e) {
    console.error(`[Sports:GroupSnapshot:${req.params.league}] Error:`, e.message);
    res.status(500).json({ error: e.message });
  }
};

export const getTeamPowerRatings = async (req, res) => {
  try {
    const ratings = await sportsDAL.getTeamPowerRatings(req.params.league.toUpperCase(), req.params.code.toUpperCase());
    res.json({ ratings });
  } catch (e) {
    console.error(`[Sports:PowerRatings:${req.params.league}:${req.params.code}] Error:`, e.message);
    res.status(500).json({ error: e.message });
  }
};

export const getTeamTrends = async (req, res) => {
  try {
    const league = req.params.league.toUpperCase();
    const code = req.params.code.toUpperCase();
    const period = req.query.period;

    if (league === 'WORLD_CUP' || league === 'MLB') {
      if (code === 'ALL') {
        const trends = await sportsDAL.getLeagueTrendSnapshots(league, period || 'all');
        res.json({ trends });
      } else {
        const trends = await sportsDAL.getTeamTrendSnapshot(league, code, period);
        res.json({ trends });
      }
    } else {
      const trends = await sportsDAL.getTeamTrends(league, code);
      res.json({ trends });
    }
  } catch (e) {
    console.error(`[Sports:Trends:${req.params.league}:${req.params.code}] Error:`, e.message);
    res.status(500).json({ error: e.message });
  }
};

export const getHistoricalMatches = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const matches = await sportsDAL.getHistoricalMatches(req.params.league.toUpperCase(), req.params.code.toUpperCase(), limit);
    res.json({ matches });
  } catch (e) {
    console.error(`[Sports:HistoricalMatches:${req.params.league}:${req.params.code}] Error:`, e.message);
    res.status(500).json({ error: e.message });
  }
};

export const getInjuryNews = async (req, res) => {
  try {
    const injuries = await sportsDAL.getInjuryNews(req.params.league.toUpperCase(), req.params.code.toUpperCase());
    res.json({ injuries });
  } catch (e) {
    console.error(`[Sports:Injuries:${req.params.league}:${req.params.code}] Error:`, e.message);
    res.status(500).json({ error: e.message });
  }
};

export const getLineupProjections = async (req, res) => {
  try {
    const lineups = await sportsDAL.getLineupProjections(req.params.league.toUpperCase(), req.params.id);
    res.json({ lineups });
  } catch (e) {
    console.error(`[Sports:Lineups:${req.params.league}:${req.params.id}] Error:`, e.message);
    res.status(500).json({ error: e.message });
  }
};

const espnNewsSchema = z.object({
  sport: z.enum(['nba', 'mlb', 'nfl', 'nhl', 'mls'], {
    errorMap: () => ({ message: 'Unsupported league for news.' })
  }),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

export const espnNews = async (req, res) => {
  try {
    const parseResult = espnNewsSchema.safeParse({
      sport: req.params.sport?.toLowerCase(),
      limit: req.query.limit
    });

    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors[0].message });
    }

    const { sport, limit } = parseResult.data;

    const NEWS_SPORT_MAP = {
      nba: 'basketball/nba',
      mlb: 'baseball/mlb',
      nfl: 'football/nfl',
      nhl: 'hockey/nhl',
      mls: 'soccer/usa.1',
    };

    const sportPath = NEWS_SPORT_MAP[sport];

    const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/news?limit=${limit}`;
    const newsRes = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!newsRes.ok) {
      return res.status(newsRes.status).json({ error: `ESPN News API returned ${newsRes.status}` });
    }

    const data = await newsRes.json();
    const articles = (data.articles || []).map((a) => ({
      headline: a.headline || '',
      description: a.description || '',
      image: a.images?.[0]?.url || null,
      url: a.links?.web?.href || a.links?.web?.self?.href || '',
      published: a.published || null,
      type: a.type || 'Article',
    }));

    res.json({
      league: sport.toUpperCase(),
      articles,
    });
  } catch (e) {
    console.error(`[ESPN News Proxy] Error:`, e.message);
    res.status(500).json({ error: e.message });
  }
};
