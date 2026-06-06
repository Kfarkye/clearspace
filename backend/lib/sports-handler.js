// ============================================================================
// Sports Handler — Enhanced for Scale (10k+ Users)
// Features: Promise TTL Caching, Graceful Degradation, Strict Entity Matching
// Uses @clearspace/sports-core for entity resolution and odds enrichment
// ============================================================================

import {
  resolveTeamAbbreviation,
  ESPN_SPORT_MAP,
  fetchCoreApiOdds,
  toAmericanOdds,
  governSportsArtifact,
} from '@clearspace/sports-core';

import * as spannerDAL from '../services/db.js';

const CONFIG = {
  LOG_PREFIX: '[CHAT:SPORTS]',
  MAPS: {
    LEAGUE_SPORT: {
      nba: 'basketball', wnba: 'basketball', cbb: 'basketball',
      nfl: 'football', cfb: 'football',
      mlb: 'baseball',
      nhl: 'hockey',
      mls: 'soccer', epl: 'soccer', liga: 'soccer', ucl: 'soccer',
    },
    POLY_TAG: {
      nba: '100640', nfl: '100639', mlb: '100641', nhl: '100642',
    },
  },
  API: {
    ESPN_SCOREBOARD: 'https://site.api.espn.com/apis/site/v2/sports/{SPORT}/{LEAGUE}/scoreboard',
    ESPN_STANDINGS: 'https://site.api.espn.com/apis/v2/sports/{SPORT}/{LEAGUE}/standings',
    ESPN_ROSTER: 'https://site.api.espn.com/apis/site/v2/sports/{SPORT}/{LEAGUE}/teams/{TEAM_ID}/roster',
    KALSHI_MARKETS: 'https://api.elections.kalshi.com/trade-api/v2/markets?limit=150',
    POLY_MARKETS: 'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100',
  },
  CACHE: {
    MAX_SIZE: 500,
    TIMEOUT_MS: { fetch: 5000, odds: 3000, roster: 2500 },
    TTL_MS: { scoreboard: 15000, standings: 300000, odds: 60000, roster: 300000 },
  },
};

// ============================================================================
// 1. PROMISE-BASED TTL CACHE (Crucial to prevent 429 Rate Limits)
// ============================================================================
const requestCache = new Map();

async function fetchWithCache(url, timeoutMs, ttlMs = 15000, maxRetries = 3) {
  const now = Date.now();

  let stalePromise = null;
  // Return existing promise if within TTL (Prevents Cache Stampedes)
  if (requestCache.has(url)) {
    const cached = requestCache.get(url);
    if (now < cached.expiresAt) {
      // P3 FIX: True LRU behavior — re-insert on hit to bump to tail
      requestCache.delete(url);
      requestCache.set(url, cached);
      return cached.promise;
    }
    // Save the expired, stale promise for fallback in case the new fetch fails
    stalePromise = cached.promise;
  }

  const fetchPromise = (async () => {
    let attempt = 0;
    while (attempt < maxRetries) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        
        if (!response.ok) {
          if (response.status === 429) {
            console.warn(`${CONFIG.LOG_PREFIX} Rate limited by ${new URL(url).hostname}`);
            break; // Don't retry on 429, fail fast
          }
          throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
      } catch (error) {
        clearTimeout(id);
        attempt++;
        if (error.name !== 'AbortError') {
          console.warn(`${CONFIG.LOG_PREFIX} Fetch fault for ${url.split('?')[0]} (Attempt ${attempt}/${maxRetries}):`, error.message);
        } else {
          console.warn(`${CONFIG.LOG_PREFIX} Fetch timeout for ${url.split('?')[0]} (Attempt ${attempt}/${maxRetries})`);
        }
        
        if (attempt < maxRetries) {
          // Exponential backoff with jitter
          const backoff = Math.pow(2, attempt) * 200 + Math.random() * 100;
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }

    // GRACEFUL DEGRADATION: Secondary cache-fallback mechanism
    if (stalePromise) {
      console.warn(`${CONFIG.LOG_PREFIX} Exhausted retries for ${url.split('?')[0]}. Falling back to stale cache.`);
      try {
        const staleData = await stalePromise;
        if (staleData) return staleData;
      } catch (e) { /* fallthrough */ }
    }

    return null; // A cached null provides a natural circuit-breaker/backoff
  })();

  requestCache.set(url, { promise: fetchPromise, expiresAt: now + ttlMs });

  // Prevent memory leaks by clearing stale cache keys
  // P3 FIX: LRU eviction logic instead of FIFO
  if (requestCache.size > CONFIG.CACHE.MAX_SIZE) {
    for (const [key, val] of requestCache.entries()) {
      if (now > val.expiresAt + (ttlMs * 10)) { // Keep strictly stale entries around a bit longer for fallback
        requestCache.delete(key);
      }
    }
    // If still oversized after pruning stale entries, delete the oldest
    if (requestCache.size > CONFIG.CACHE.MAX_SIZE) {
      const firstKey = requestCache.keys().next().value;
      requestCache.delete(firstKey);
    }
  }

  return fetchPromise;
}

// ============================================================================
// Utilities
// ============================================================================

function parseTemporalContext(dateStr) {
  if (!dateStr || !/^\d{8}$/.test(dateStr)) return { isHistorical: false, formattedDate: '' };
  try {
    const y = parseInt(dateStr.substring(0, 4), 10);
    const m = parseInt(dateStr.substring(4, 6), 10) - 1;
    const d = parseInt(dateStr.substring(6, 8), 10);
    
    // Buffer by 36 hours from noon UTC to avoid late-night timezone drift
    const qDate = new Date(Date.UTC(y, m, d, 12, 0, 0));
    const isHistorical = (Date.now() - qDate.getTime()) > 36 * 60 * 60 * 1000;
    
    return { 
      isHistorical, 
      formattedDate: `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}` 
    };
  } catch {
    return { isHistorical: false, formattedDate: '' };
  }
}

// SAFE STRING MATCHING: Prevents 'IN' (Indiana) from matching 'Inflation'
function hasStrictWordMatch(text, fullNames, abbreviations) {
  if (!text) return false;
  const normalizedText = text.toLowerCase();
  
  if (fullNames.some(name => name && normalizedText.includes(name.toLowerCase()))) {
    return true;
  }
  
  return abbreviations.some(abbr => {
    if (!abbr) return false;
    return new RegExp(`\\b${abbr.toLowerCase()}\\b`, 'i').test(normalizedText);
  });
}

function extractPlayoffContext(events, searchTeam) {
  const normalizedSearch = searchTeam.toLowerCase();
  for (const game of events) {
    const comp = game.competitions?.[0];
    if (!comp) continue;
    
    const teamInGame = comp.competitors?.some(c =>
      c.team?.abbreviation?.toLowerCase() === normalizedSearch ||
      c.team?.name?.toLowerCase().includes(normalizedSearch) ||
      c.team?.displayName?.toLowerCase().includes(normalizedSearch)
    );
    if (!teamInGame) continue;

    const season = game.season?.type;
    const notes = (comp.notes?.[0]?.headline || '').toLowerCase();
    const isPlayoff = season === 3 || season === 4 ||
      game.season?.slug?.includes('post') || comp.series?.summary ||
      notes.includes('final') || notes.includes('playoff') || notes.includes('round');
      
    if (isPlayoff) {
      const teamComp = comp.competitors?.find(c =>
        c.team?.abbreviation?.toLowerCase() === normalizedSearch ||
        c.team?.name?.toLowerCase().includes(normalizedSearch)
      );
      return {
        teamAbbreviation: teamComp?.team?.abbreviation || searchTeam.toUpperCase(),
        groupName: comp.notes?.[0]?.headline || comp.series?.title || 'Playoffs',
        gamesBack: comp.series?.summary || game.series?.summary || 'Series',
        streak: teamComp?.records?.find(r => r.type === 'playoff')?.summary || '-',
        overallRecord: comp.series?.summary || '-',
        isPlayoff: true,
      };
    }
  }
  return null;
}

function extractLeagueContext(standingsData, searchTeam) {
  if (!standingsData?.children) return undefined;
  const normalizedSearch = searchTeam.toLowerCase();
  let foundEntry = null;
  let groupName = '';

  for (const conf of standingsData.children) {
    const searchGroups = conf.children ? [conf, ...conf.children] : [conf];
    for (const group of searchGroups) {
      const match = group.standings?.entries?.find(e =>
        e.team?.abbreviation?.toLowerCase() === normalizedSearch ||
        e.team?.name?.toLowerCase().includes(normalizedSearch) ||
        e.team?.displayName?.toLowerCase().includes(normalizedSearch)
      );
      if (match) { foundEntry = match; groupName = group.name; break; }
    }
    if (foundEntry) break;
  }
  if (!foundEntry) return undefined;

  const getStat = (name, fallback = '-') => {
    const stat = foundEntry.stats?.find(s => s.name === name);
    return stat ? stat.displayValue : fallback;
  };
  
  return {
    teamAbbreviation: foundEntry.team?.abbreviation,
    groupName,
    gamesBack: getStat('gamesBehind'),
    streak: getStat('streak'),
    winPercent: getStat('winPercent'),
    overallRecord: getStat('overall'),
    seed: getStat('playoffSeed'),
    isPlayoff: false,
  };
}

async function fetchRosterInjuries(sport, league, teamId, teamAbbr) {
  const url = CONFIG.API.ESPN_ROSTER.replace('{SPORT}', sport).replace('{LEAGUE}', league).replace('{TEAM_ID}', teamId);
  const data = await fetchWithCache(url, CONFIG.CACHE.TIMEOUT_MS.roster, CONFIG.CACHE.TTL_MS.roster);
  
  if (!data?.athletes) return null;
  
  try {
    const injured = [];
    for (const group of data.athletes) {
      for (const athlete of group.items || []) {
        const statusStr = athlete.injuries?.[0]?.status || (athlete.status?.id !== '1' ? athlete.status?.name : '');
        if (statusStr && !statusStr.toLowerCase().includes('active')) {
          injured.push({
            id: athlete.id, name: athlete.fullName,
            position: athlete.position?.abbreviation || group.position || 'UNK',
            status: statusStr,
          });
        }
      }
    }
    return injured.length > 0 ? { teamAbbreviation: teamAbbr, players: injured } : null;
  } catch { return null; }
}

// ============================================================================
// Best Value Selection
// Normalizes all book odds to American ML, picks the best payout per side.
// Best payout = highest American odds number (+200 > +150, -130 > -170).
// ============================================================================
function pickBestBook(books, side) {
  let best = null;
  for (const b of books) {
    const ml = side === 'home' ? b.homeML : b.awayML;
    if (ml == null) continue;
    const mlNum = typeof ml === 'number' ? ml : parseInt(ml, 10);
    if (isNaN(mlNum)) continue;
    if (!best || mlNum > best.ml) {
      best = { provider: b.provider, ml: mlNum, deepLink: b.deepLink };
    }
  }
  return best;
}

// ============================================================================
// Core Orchestrator
// ============================================================================
export async function handleSportsQuery(rawParams) {
  const fetchTimestamp = Date.now();
  const { team, league, date, include_odds } = rawParams || {};

  if (!league) {
    return { id: `err_league_${Date.now()}`, type: 'SPORTS_ARTIFACT', resolution_state: 'GROUNDING_FAULT',
      context_summary: 'League scope required. Please specify the league (e.g., NBA, NFL).' };
  }

  const safeLeague = String(league).toLowerCase();
  const sport = CONFIG.MAPS.LEAGUE_SPORT[safeLeague] || 'basketball';
  const safeTeam = team ? String(team).trim().toLowerCase() : null;
  const { isHistorical, formattedDate } = parseTemporalContext(date);
  
  // Only fetch odds if requested AND event isn't strictly historical
  const fetchOdds = (include_odds !== false && include_odds !== 'false') && !isHistorical;

  try {
    const scoreboardUrl = `${CONFIG.API.ESPN_SCOREBOARD.replace('{SPORT}', sport).replace('{LEAGUE}', safeLeague)}${date ? `?dates=${date}` : ''}`;
    const standingsUrl = CONFIG.API.ESPN_STANDINGS.replace('{SPORT}', sport).replace('{LEAGUE}', safeLeague);
    
    // Use mapped Poly Tag, or fallback to general query if unknown
    const polyTag = CONFIG.MAPS.POLY_TAG[safeLeague] ? `&tag_id=${CONFIG.MAPS.POLY_TAG[safeLeague]}` : '';
    const polyUrl = `${CONFIG.API.POLY_MARKETS}${polyTag}`;

    // Parallel execution with CONFIG-driven caching bounds
    const [sbData, stData, kData, pData] = await Promise.all([
      fetchWithCache(scoreboardUrl, CONFIG.CACHE.TIMEOUT_MS.fetch, CONFIG.CACHE.TTL_MS.scoreboard),
      safeTeam ? fetchWithCache(standingsUrl, CONFIG.CACHE.TIMEOUT_MS.fetch, CONFIG.CACHE.TTL_MS.standings) : Promise.resolve(null),
      fetchOdds ? fetchWithCache(CONFIG.API.KALSHI_MARKETS, CONFIG.CACHE.TIMEOUT_MS.odds, CONFIG.CACHE.TTL_MS.odds) : Promise.resolve(null),
      fetchOdds ? fetchWithCache(polyUrl, CONFIG.CACHE.TIMEOUT_MS.odds, CONFIG.CACHE.TTL_MS.odds) : Promise.resolve(null),
    ]);

    if (!sbData || !Array.isArray(sbData.events)) {
       throw new Error('ESPN scoreboard API failed or timed out');
    }

    const rawKalshiMarkets = kData?.markets || [];
    const rawPolyEvents = Array.isArray(pData) ? pData : [];

    if (sbData.events.length === 0) {
      return { id: `evt_none_${Date.now()}`, type: 'SPORTS_ARTIFACT', resolution_state: 'NO_GAMES_SCHEDULED',
        context_summary: `No ${safeLeague.toUpperCase()} events scheduled${date ? ` for ${formattedDate}` : ' live'}.` };
    }

    let events = sbData.events;
    if (safeTeam) {
      events = events.filter(e =>
        e.competitions?.[0]?.competitors?.some(c =>
          c.team?.abbreviation?.toLowerCase() === safeTeam ||
          c.team?.name?.toLowerCase().includes(safeTeam) ||
          c.team?.displayName?.toLowerCase().includes(safeTeam)
        )
      );
    }

    if (events.length === 0) {
      return { id: `evt_none_team_${Date.now()}`, type: 'SPORTS_ARTIFACT', resolution_state: 'NO_GAMES_SCHEDULED',
        context_summary: `No active events for '${safeTeam}' in ${safeLeague.toUpperCase()}.` };
    }

    const parsedEvents = (await Promise.all(events.map(async game => {
      const comp = game.competitions?.[0];
      if (!comp) return null;
      
      const homeComp = comp.competitors?.find(c => c.homeAway === 'home');
      const awayComp = comp.competitors?.find(c => c.homeAway === 'away');
      if (!homeComp || !awayComp) return null;

      const homeAbbr = resolveTeamAbbreviation(homeComp.team?.displayName || homeComp.team?.name, { league: safeLeague }) || homeComp.team?.abbreviation;
      const awayAbbr = resolveTeamAbbreviation(awayComp.team?.displayName || awayComp.team?.name, { league: safeLeague }) || awayComp.team?.abbreviation;

      const homeNameLow = (homeComp.team?.name || '').toLowerCase();
      const awayNameLow = (awayComp.team?.name || '').toLowerCase();

      const isPreGame = comp.status?.type?.state === 'pre';
      const isLive = comp.status?.type?.state === 'in';
      const homeScore = parseInt(homeComp.score, 10);
      const awayScore = parseInt(awayComp.score, 10);

      // --- LIVE DATA ENRICHMENT (Gap 1 & Gap 3) ---
      let spannerEdge = null;
      if (isLive) {
        // Gap 1: Fetch summary to get full situation
        try {
          const sumUrl = `https://site.api.espn.com/apis/site/v2/sports/${ESPN_SPORT_MAP[safeLeague] || 'baseball'}/${safeLeague}/summary?event=${game.id}`;
          const summaryData = await fetchWithCache(sumUrl, 5000, 10000); // 10s TTL for live
          if (summaryData && summaryData.header && summaryData.header.competitions && summaryData.header.competitions[0]) {
             const sumComp = summaryData.header.competitions[0];
             if (sumComp.situation) {
               comp.situation = sumComp.situation;
             }
          }
        } catch (e) {
          console.error('[SPORTS] Failed to fetch live summary for', game.id, e.message);
        }

        // Gap 3: Fetch edge from Spanner
        try {
          const db = spannerDAL._getDatabase();
          if (db) {
            const [rows] = await db.run({
              sql: `SELECT edge_pct_home, edge_pct_away, is_suspended, home_prob_poly, away_prob_poly, dk_implied_no_vig 
                    FROM live_snapshots 
                    WHERE match_id = @matchId 
                    ORDER BY captured_at DESC LIMIT 1`,
              params: { matchId: game.id },
            });
            if (rows && rows.length > 0) {
              spannerEdge = rows[0].toJSON();
            }
          }
        } catch (e) {
          console.error('[SPORTS] Failed to fetch Spanner edge for', game.id, e.message);
        }
      }

      // --- Odds Extraction ---
      let odds = null;
      if (fetchOdds) {
        const rawOdds = comp.odds || [];
        const embeddedDk = rawOdds.find(o =>
          o.provider?.name?.toLowerCase().includes('draftkings') ||
          o.provider?.name?.toLowerCase().includes('william')
        ) || rawOdds[0];

        let coreOdds = null;
        try {
          coreOdds = await fetchCoreApiOdds({
            sport: safeLeague, eventId: game.id,
            competitionId: comp.id || game.id, isLive,
          });
        } catch { /* suppress non-fatal */ }

        odds = coreOdds || (embeddedDk ? {
          provider: embeddedDk.provider?.name || 'DraftKings',
          spread: embeddedDk.details || '',
          overUnder: embeddedDk.overUnder || null,
          homeMoneyline: embeddedDk.homeTeamOdds?.moneyLine || null,
          awayMoneyline: embeddedDk.awayTeamOdds?.moneyLine || null,
        } : null);
      }

      const fullNames = [homeComp.team?.name, awayComp.team?.name];
      const abbrs = [homeAbbr, awayAbbr];

      // --- Kalshi Matching (with P0 home/away flip detection) ---
      let kalshiOdds = null;
      let kalshiTicker = null;
      if (rawKalshiMarkets.length > 0) {
        const matchedMarket = rawKalshiMarkets.find(m => 
          hasStrictWordMatch(`${m.title || ''} ${m.yes_sub_title || ''}`, fullNames, abbrs)
        );
        if (matchedMarket) {
          const yesProbRaw = parseFloat(matchedMarket.yes_ask_dollars || 0);
          const noProbRaw = parseFloat(matchedMarket.no_ask_dollars || 0);
          const yesTitle = (matchedMarket.yes_sub_title || '').toLowerCase();
          kalshiTicker = matchedMarket.ticker_name || null;

          if (yesProbRaw > 0 && yesProbRaw < 1) {
            let impliedHome = Math.round(yesProbRaw * 100);
            let impliedAway = Math.round(noProbRaw * 100);
            // Flip if the "Yes" market explicitly targets the away team
            if (yesTitle.includes(awayNameLow) && !yesTitle.includes(homeNameLow)) {
              impliedHome = Math.round(noProbRaw * 100);
              impliedAway = Math.round(yesProbRaw * 100);
            }
            kalshiOdds = { provider: 'Kalshi', impliedHome, impliedAway,
              americanHome: toAmericanOdds(impliedHome / 100), americanAway: toAmericanOdds(impliedAway / 100) };
          }
        }
      }

      // --- Polymarket Matching (with P0 home/away flip detection) ---
      let polyOdds = null;
      let polySlug = null;
      if (rawPolyEvents.length > 0) {
        const matchedEvent = rawPolyEvents.find(ev => 
          hasStrictWordMatch(`${ev.title || ''} ${ev.slug || ''}`.replace(/-/g, ' '), fullNames, abbrs)
        );
        if (matchedEvent) {
          polySlug = matchedEvent.slug || null;
          for (const mkt of (matchedEvent.markets || [])) {
            try {
              const outcomes = JSON.parse(mkt.outcomes || '[]');
              const prices = JSON.parse(mkt.outcomePrices || '[]');
              if (outcomes.length >= 2 && prices.length >= 2) {
                const p0 = parseFloat(prices[0]) || 0;
                const p1 = parseFloat(prices[1]) || 0;
                const o0 = (outcomes[0] || '').toLowerCase();
                
                // Skip Over/Under props, strictly hunt moneylines
                if (['over', 'under', 'yes', 'no'].includes(o0) || /[+-]\d/.test(o0)) continue;
                
                if (p0 > 0 && p0 < 1 && p1 > 0 && p1 < 1) {
                  let homeProb = Math.round(p0 * 100);
                  let awayProb = Math.round(p1 * 100);
                  // Flip if outcome[0] explicitly names the away team
                  if (o0.includes(awayNameLow) && !o0.includes(homeNameLow)) {
                    homeProb = Math.round(p1 * 100);
                    awayProb = Math.round(p0 * 100);
                  }
                  polyOdds = { provider: 'Polymarket', impliedHome: homeProb, impliedAway: awayProb,
                    americanHome: toAmericanOdds(homeProb / 100), americanAway: toAmericanOdds(awayProb / 100),
                    volume: parseFloat(mkt.volume || '0') };
                  break;
                }
              }
            } catch { /* skip */ }
          }
        }
      }

      // --- Build normalized books array + best value selection ---
      const books = [];
      if (odds) {
        books.push({
          provider: odds.provider || 'DraftKings',
          homeML: odds.homeMoneyline, awayML: odds.awayMoneyline,
          spread: odds.spread, overUnder: odds.overUnder,
          deepLink: 'https://sportsbook.draftkings.com',
        });
      }
      if (kalshiOdds) {
        books.push({
          provider: 'Kalshi',
          homeML: kalshiOdds.americanHome, awayML: kalshiOdds.americanAway,
          impliedHome: kalshiOdds.impliedHome, impliedAway: kalshiOdds.impliedAway,
          deepLink: kalshiTicker ? `https://kalshi.com/markets/${kalshiTicker}` : 'https://kalshi.com',
        });
      }
      if (polyOdds) {
        books.push({
          provider: 'Polymarket',
          homeML: polyOdds.americanHome, awayML: polyOdds.americanAway,
          impliedHome: polyOdds.impliedHome, impliedAway: polyOdds.impliedAway,
          volume: polyOdds.volume,
          deepLink: polySlug ? `https://polymarket.com/event/${polySlug}` : 'https://polymarket.com',
        });
      }

      const bestHome = pickBestBook(books, 'home');
      const bestAway = pickBestBook(books, 'away');

      let live_situation = undefined;
      if (isLive && comp.situation) {
        live_situation = {
          inning_number: comp.status?.period,
          inning_half: comp.status?.type?.shortDetail?.toLowerCase().includes('bot') ? 'bottom' : 'top',
          outs: comp.situation.outs || 0,
          balls: comp.situation.balls || 0,
          strikes: comp.situation.strikes || 0,
          bases: {
            on_first: !!comp.situation.onFirst,
            on_second: !!comp.situation.onSecond,
            on_third: !!comp.situation.onThird
          },
          pitcher: comp.situation.pitcher?.athlete ? {
            pitcher_id: comp.situation.pitcher.athlete.id,
            name: comp.situation.pitcher.athlete.displayName,
            pitch_count: comp.situation.pitcher.stats?.[0] || 0,
          } : undefined,
          batter: comp.situation.batter?.athlete ? {
            batter_id: comp.situation.batter.athlete.id,
            name: comp.situation.batter.athlete.displayName,
          } : undefined,
          // Spanner Edge Fields
          edge_pct_home: spannerEdge?.edge_pct_home || null,
          edge_pct_away: spannerEdge?.edge_pct_away || null,
          is_suspended: spannerEdge?.is_suspended || false,
          dk_implied_no_vig: spannerEdge?.dk_implied_no_vig || null,
          home_prob_poly: spannerEdge?.home_prob_poly || null,
          away_prob_poly: spannerEdge?.away_prob_poly || null,
        };
      }

      const eventData = {
        game_id: game.id,
        status: comp.status?.type?.name,
        short_status: comp.status?.type?.shortDetail,
        series_summary: comp.series?.summary || '',
        game_notes: comp.notes?.[0]?.headline || '',
        start_time: game.date,
        venue: comp.venue?.fullName,
        broadcast: comp.broadcasts?.[0]?.names?.join(', ') || '',
        home_team: { id: homeComp.team?.id, name: homeComp.team?.name, abbreviation: homeAbbr,
          logo: homeComp.team?.logo, score: isPreGame || isNaN(homeScore) ? undefined : homeScore,
          record: homeComp.records?.find(r => r.type === 'total')?.summary },
        away_team: { id: awayComp.team?.id, name: awayComp.team?.name, abbreviation: awayAbbr,
          logo: awayComp.team?.logo, score: isPreGame || isNaN(awayScore) ? undefined : awayScore,
          record: awayComp.records?.find(r => r.type === 'total')?.summary },
        odds: fetchOdds ? (odds ? { ...odds, kalshi: kalshiOdds } : (kalshiOdds ? { kalshi: kalshiOdds } : undefined)) : undefined,
        books: books.length > 0 ? books : undefined,
        bestBook: (bestHome || bestAway) ? { home: bestHome, away: bestAway } : undefined,
        predictor: comp.predictor ? {
          homeWinPct: Math.round((comp.predictor.homeTeam?.gameProjection || 0) * 10) / 10,
          awayWinPct: Math.round((comp.predictor.awayTeam?.gameProjection || 0) * 10) / 10,
        } : undefined,
        live_situation,
      };

      // GRACEFUL DEGRADATION: If ESPN injury API throws a 502, the scoreboard payload still safely renders.
      if (isPreGame && safeTeam) {
        const injuryResults = await Promise.allSettled([
          fetchRosterInjuries(sport, safeLeague, homeComp.team?.id, homeAbbr),
          fetchRosterInjuries(sport, safeLeague, awayComp.team?.id, awayAbbr),
        ]);
        
        const injuries = injuryResults
          .filter(res => res.status === 'fulfilled' && res.value)
          .map(res => res.value);
          
        if (injuries.length > 0) eventData.injuries = injuries;
      }

      return eventData;
    }))).filter(Boolean);

    const rawArtifact = {
      id: `evt_${Date.now()}`,
      type: 'SPORTS_ARTIFACT',
      resolution_state: 'LIVE_DATA',
      data: {
        events: parsedEvents,
        league_context: safeTeam ? (
          extractPlayoffContext(sbData.events, safeTeam) ||
          (stData ? extractLeagueContext(stData, safeTeam) : undefined)
        ) : undefined,
      },
    };

    // Phase 3: Governance gate — validate odds, enforce freshness, strip hallucinations
    return governSportsArtifact(rawArtifact, fetchTimestamp);
  } catch (e) {
    console.error(`${CONFIG.LOG_PREFIX} Orchestration fault:`, e);
    return { id: `err_${Date.now()}`, type: 'SPORTS_ARTIFACT', resolution_state: 'GROUNDING_FAULT',
      context_summary: 'A connection error occurred while querying live sports data.' };
  }
}
