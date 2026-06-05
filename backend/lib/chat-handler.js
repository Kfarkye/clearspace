// ============================================================================
// Chat Handler — Enterprise Gemini 3.5 Flash chat engine
// Features: AbortControllers, Zero-Leak Timeouts, LRU Caching, ReDoS Immunity
// Bugfix: Semantic Tool Boundaries for Live Game Tracking vs. Macro Betting
// ============================================================================

import { GoogleGenAI, Type } from '@google/genai';
import { randomUUID } from 'crypto';
import { handleSportsQuery } from './sports-handler.js';
import { handleWinProbabilityQuery } from './win-probability-handler.js';
import { handlePlayerPropQuery } from './player-prop-handler.js';
import { fetchDataTable } from './data-table-agent.js';
import * as sportsDAL from './sports-dal.js';
import {
  fetchAtsRecord, fetchOuRecord, fetchRunlineRecord,
  fetchMoneylineRecord, applyAtsFilters, generateBettingAngles,
} from '@clearspace/sports-core';

// ── Configuration ─────────────────────────────────────────────────────────

const MODEL_ID = 'gemini-3.5-flash';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_AGGREGATE_HISTORY_CHARS = 16000; // Protects Token Per Minute (TPM) limits
const ENGINE_TIMEOUT_MS = 15000;

const BLOCKED_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  /<\|system\|>/i,
  /act\s+as\s+(if\s+)?you\s+(are|were)\s+/i,
];

// ── YouTube LRU Cache (Prevents Event-Loop Lockup & IP Bans) ──────────────

const ytCache = new Map();
const YT_CACHE_TTL = 1000 * 60 * 15; // 15 minutes

async function searchYouTubeCached(query) {
  const normalizedQuery = query.toLowerCase().trim();
  const now = Date.now();

  const cached = ytCache.get(normalizedQuery);
  if (cached && now < cached.expiresAt) return cached.data;

  // Dynamic import to avoid hard crash if yt-search is not installed
  let ytSearch;
  try {
    ytSearch = (await import('yt-search')).default;
  } catch {
    console.warn('[CHAT] yt-search not installed, skipping YouTube search');
    return [];
  }

  const r = await ytSearch(normalizedQuery);
  const videos = r.videos.slice(0, 3).map(v => ({
    title: v.title, url: v.url, thumbnail: v.thumbnail,
    author: v.author?.name, duration: v.timestamp,
  }));

  ytCache.set(normalizedQuery, { data: videos, expiresAt: now + YT_CACHE_TTL });

  // Prevent unbounded growth
  if (ytCache.size > 500) {
    const oldestKey = ytCache.keys().next().value;
    if (oldestKey) ytCache.delete(oldestKey);
  }

  return videos;
}

// ── $ref Bomb Defuser ─────────────────────────────────────────────────────
// ESPN's Hypermedia API returns `$ref` keys with internal URLs.
// Vertex AI's strict OpenAPI schema parser treats `$ref` as a reserved keyword
// and crashes with INVALID_ARGUMENT (400) when it encounters them.

const sanitizeForGemini = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForGemini);

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    // Strip poisonous schema keywords that crash Vertex AI
    if (key === '$ref' || key === 'href' || key === 'uid' || key === 'links') continue;
    clean[key] = sanitizeForGemini(value);
  }
  return clean;
};

// ── Tool Declarations (Semantic Guardrails Applied) ───────────────────────

const sportsToolDeclaration = {
  name: 'delegate_sports_query',
  // CRITICAL FIX: Negative constraint against tables and standings
  description: 'Fetches live scoreboards, game status, and scheduled sports data. CRITICAL: Use this tool whenever a user asks to TRACK a game, monitor a live event, check a live score, or check a bet. DO NOT use this tool if the user asks for a "table", "sheet", full league "standings", or a full list of team records.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: { type: Type.STRING, description: 'Canonical team abbreviation or name, e.g., LAL, NYY, Lakers' },
      league: { type: Type.STRING, description: 'Sports league, e.g., nba, nfl, mlb, nhl' },
      date: { type: Type.STRING, description: 'Date in YYYYMMDD format. Extract from user temporal context.' },
      include_odds: { type: Type.BOOLEAN, description: 'True if user explicitly asks for odds/lines/spread.' },
    },
    required: ['league'],
  },
};

const winProbabilityToolDeclaration = {
  name: 'get_win_probability',
  description: 'Fetches play-by-play win probability data for a specific live or finished game.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: { type: Type.STRING, description: 'Team name or abbreviation' },
      league: { type: Type.STRING, description: 'Sports league, e.g., mlb, nba' },
    },
    required: ['team'],
  },
};

const playerPropToolDeclaration = {
  name: 'get_player_props',
  description: 'Fetches live player statistics fused with betting prop lines (over/under) for star players.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: { type: Type.STRING, description: 'Team name or abbreviation' },
      league: { type: Type.STRING, description: 'Sports league, e.g., mlb, nba' },
    },
    required: ['team'],
  },
};

const bettingTrendsToolDeclaration = {
  name: 'get_betting_trends',
  // CRITICAL FIX: Negative constraints. Explicitly forbid live game tracking.
  description: 'Fetches historical ATS, Over/Under, Run Line, and Moneyline betting trend records to synthesize NEW betting angles. DO NOT use this tool to track live games, check live scores, or monitor an existing bet.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: { type: Type.STRING, description: "Team name (e.g. 'Baltimore Orioles') or 'all' for all 30 MLB teams" },
      trend_type: { type: Type.STRING, description: "One of: 'ats', 'ou', 'runline', 'moneyline', or 'all'" },
    },
    required: ['team', 'trend_type'],
  },
};

const dataTableToolDeclaration = {
  name: 'generate_data_table',
  // CRITICAL FIX: Explicitly map "standings" and "records" here
  description: 'Generates a structured data table, ranking, or comparison sheet from grounded search data. CRITICAL: You MUST use this tool IMMEDIATELY if the user asks for a "table", "sheet", "ranking", "standings", or a list of team records (e.g., "table sheet of all 30 teams record").',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "The exact search query to build the table, e.g. 'Current MLB standings and records for all 30 teams'" },
    },
    required: ['query'],
  },
};

const standingsToolDeclaration = {
  name: 'get_league_standings',
  description: 'Generates a data table of current league standings, win/loss records, and rankings. CRITICAL: Use this ANY TIME a user asks for "standings", "rankings", or "team records".',
  parameters: {
    type: Type.OBJECT,
    properties: {
      league: { type: Type.STRING, description: 'Sports league, e.g., MLB, NBA, NFL, NHL' }
    },
    required: ['league'],
  },
};

const worldCupTrendsToolDeclaration = {
  name: 'get_world_cup_trends',
  description: 'Fetches calculated historical betting trends (win rate, goals averages, clean sheets, over 2.5 rate, BTTS rate, and recent form strings) for a qualified World Cup team from our verified database.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: { type: Type.STRING, description: 'Canonical 3-letter team code (e.g. USA, MEX, ESP, ARG, BRA, FRA, GER)' },
      period: { type: Type.STRING, description: "Period of trend snapshots: 'last_10', 'last_20', or 'all'. Defaults to 'all'." }
    },
    required: ['team']
  }
};

const worldCupHistoricalMatchesToolDeclaration = {
  name: 'get_world_cup_historical_matches',
  description: 'Retrieves the chronological list of recent historical matches played by a qualified World Cup team (including scores, opponent, and result) from our verified database.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: { type: Type.STRING, description: 'Canonical 3-letter team code (e.g. USA, MEX, ESP, ARG, BRA, FRA, GER)' },
      limit: { type: Type.INTEGER, description: 'Maximum number of match records to retrieve. Defaults to 20.' }
    },
    required: ['team']
  }
};

const mlbTrendsToolDeclaration = {
  name: 'get_mlb_trends',
  description: 'Fetches calculated historical betting trends (win rate, runs averages, shutout rate, over 8.5 rate, BTTS rate, and recent form strings) for a specific MLB team or all teams from our verified database.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: { type: Type.STRING, description: 'Canonical 3-letter team abbreviation (e.g. NYY, LAD, BOS, CHC, SF) or "all" to retrieve trends for all 30 teams.' },
      period: { type: Type.STRING, description: "Period of trend snapshots: 'last_10', 'last_20', or 'all'. Defaults to 'all'." }
    },
    required: ['team']
  }
};

const mlbHistoricalMatchesToolDeclaration = {
  name: 'get_mlb_historical_matches',
  description: 'Retrieves the chronological list of recent historical matches played by an MLB team (including runs, opponent, and result) from our verified database.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: { type: Type.STRING, description: 'Canonical 3-letter team abbreviation (e.g. NYY, LAD, BOS, CHC, SF)' },
      limit: { type: Type.INTEGER, description: 'Maximum number of match records to retrieve. Defaults to 20.' }
    },
    required: ['team']
  }
};

// ── System Prompt ─────────────────────────────────────────────────────────

function buildSystemPrompt() {
  const now = new Date();
  // FIX: Force US Pacific timezone to prevent UTC drift
  // At 6PM Pacific on June 4th, UTC is already June 5th — wrong day's games
  const dateContext = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now).replace(/-/g, '');
  const yearContext = now.getFullYear();

  return `You are AURA, an elite AI-native sports intelligence platform, live game tracker, and world-class betting sharp.
TEMPORAL CONTEXT: The current year is ${yearContext}. Target modern context. Current Date: ${dateContext}

TOOL ROUTING PROTOCOL (STRICT):
1. LIVE TRACKING & SCORES: If a user asks to "track" a specific game, check a live score, or monitor a live event/bet status, use \`delegate_sports_query\`. DO NOT use this tool for general betting recommendations, value bets, or macro betting queries (e.g., "best mlb bets").
2. TRENDS & NEW BETS: Use \`get_betting_trends\` for general/non-database macro betting queries, historical records, value bets, or betting angles not covered by the World Cup or MLB verified databases.
3. STANDINGS & RECORDS (CRITICAL): If the user asks for "standings", a "table", "sheet", or full list of team records, you MUST use \`get_league_standings\`. DO NOT use the sports query tool for standings.
4. WORLD CUP HISTORICAL DATA & TRENDS: If the user asks about a qualified World Cup team's historical performance, averages, recent match logs, over/under rates, clean-sheet rates, win rates, or trends, you MUST use \`get_world_cup_trends\` or \`get_world_cup_historical_matches\` to retrieve the data from our verified database. Always supply the canonical 3-letter team code (e.g. USA, MEX, ESP, ARG, BRA, FRA, GER).
5. MLB HISTORICAL DATA & TRENDS (CRITICAL): If the user asks about an MLB team's historical performance, averages, recent match logs, over/under rates, shutout rates, win rates, or trends, or asks for general "best mlb bets", you MUST use \`get_mlb_trends\` or \`get_mlb_historical_matches\` to retrieve the data from our verified database. For a general query like "best mlb bets", call \`get_mlb_trends\` with team = "all" and period = "all". Always supply the canonical 3-letter team abbreviation (e.g. NYY, LAD, BOS, CHC, SF).
6. DATABASE FIRST: You MUST use the database-backed tools (get_world_cup_trends, get_world_cup_historical_matches, get_mlb_trends, get_mlb_historical_matches) immediately for any historical data, match logs, or trends related to qualified World Cup teams or MLB teams. DO NOT perform a Google Search first for these queries.


When the user asks for sports data you MUST extract parameters in canonical format and trigger the appropriate tool.
If a temporal context is clearly provided (like "yesterday", "last week", or a specific date), parse it to YYYYMMDD format exactly. If no temporal context is provided, DO NOT provide a date parameter. Let the tool default to live data.

CRITICAL BETTING PREVIEW ALGORITHM:
1. THE SETUP: Identify market dynamics and retail betting traps.
2. BY THE NUMBERS: Use Google Search for advanced trends (O/U distributions, xG, H2H).
3. THE ANGLE: Elite bettors exploit variance between public perception and statistical reality. Fade the public.
4. THE DELIVERY: Professional prose. Frame your final betting angle cleanly, prioritizing value and CLV.

When surfacing betting analysis, output using a JSON code block with the language "bettingangles".
Each angle MUST include a "book" field with the sportsbook name (e.g., "DraftKings", "Kalshi", "Polymarket") and optionally a "deepLink" URL to the market.

When asked for highlights or videos, output a JSON code block with language "youtube_media":
\`\`\`youtube_media
{ "query": "search terms here" }
\`\`\`

CAPABILITY BOUNDARIES (STRICT):
- You have access to live scores, situations, and basic odds via \`delegate_sports_query\`.
- You DO NOT currently have access to granular MLB Statcast data, pitch velocity, or live pitch counts.
- If a user asks for granular pitch data or velocity, DO NOT attempt to call a tool. Gracefully inform them that live pitch-tracking telemetry is currently offline, and pivot to offering live matchup analysis or betting angles instead.
- If a user asks about a specific team, you MUST pass that EXACT team name to the tool. If the tool returns no data for that team, do NOT substitute another team. State clearly that the team is not playing.

VOICE: Punchy. Efficient. Zero fluff. Lead with the finding that changes the decision.
Banned: leverage, optimize, streamline, unlock, elevate, holistic, robust, actionable, deep dive, seamless.`;
}

// ── ReDoS-Immune Markdown Parser ──────────────────────────────────────────

function extractJsonFromMarkdown(text, language) {
  if (!text) return null;
  const startTag = `\`\`\`${language}`;
  const startIndex = text.indexOf(startTag);
  if (startIndex === -1) return null;

  const contentStart = startIndex + startTag.length;
  const endIndex = text.indexOf('```', contentStart);
  if (endIndex === -1) return null;

  try {
    let rawJson = text.substring(contentStart, endIndex).trim();
    rawJson = rawJson.replace(/[\x00-\x1F\x7F]/g, ch => {
      if (ch === '\n') return '\\n';
      if (ch === '\r') return '\\r';
      if (ch === '\t') return '\\t';
      return '';
    });
    rawJson = rawJson.replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(rawJson);
  } catch (error) {
    console.warn(`[CHAT] Failed to parse ${language} block securely.`);
    return null;
  }
}

// ── Core Intent Processor ─────────────────────────────────────────────────

let aiClient = null;

function getAiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && !apiKey.startsWith('YOUR_')) {
      aiClient = new GoogleGenAI({ apiKey });
    } else {
      aiClient = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829',
        location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      });
    }
  }
  return aiClient;
}

export async function processIntent(message, history, signal) {
  const ai = getAiClient();

  const contents = [
    ...(history || []).map(h => ({ role: h.role, parts: [{ text: h.content }] })),
    { role: 'user', parts: [{ text: message }] },
  ];

  if (signal?.aborted) throw new Error('Client Disconnected');

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Engine Timeout')), ENGINE_TIMEOUT_MS);
  });

  let response;
  try {
    response = await Promise.race([
      ai.models.generateContent({
        model: MODEL_ID,
        contents,
        config: {
          systemInstruction: buildSystemPrompt(),
          tools: [
            { functionDeclarations: [
                sportsToolDeclaration,
                winProbabilityToolDeclaration,
                playerPropToolDeclaration,
                bettingTrendsToolDeclaration,
                dataTableToolDeclaration,
                standingsToolDeclaration,
                worldCupTrendsToolDeclaration,
                worldCupHistoricalMatchesToolDeclaration,
                mlbTrendsToolDeclaration,
                mlbHistoricalMatchesToolDeclaration
            ] },
            { googleSearch: {} },
          ],
          temperature: 0.7,
        },
      }),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeoutId); 
  }

  if (signal?.aborted) throw new Error('Client Disconnected');

  const emitArtifacts = [];

  // ── Handle Concurrent Tool Calls ─────────────────────────────────────────
  if (response.functionCalls && response.functionCalls.length > 0) {
    const toolExecutions = response.functionCalls.map(async (call) => {
      if (signal?.aborted) return null;

      console.log(`[CHAT] Tool triggered: ${call.name}`, call.args);

      try {
        switch (call.name) {
          case 'delegate_sports_query':
            return sanitizeForGemini(await handleSportsQuery(call.args));
          case 'get_win_probability':
            return await handleWinProbabilityQuery(call.args);
          case 'get_player_props':
            return await handlePlayerPropQuery(call.args);
          case 'generate_data_table':
            return {
              id: randomUUID(), type: 'DATA_TABLE', resolution_state: 'RESOLVED',
              context_summary: 'Data Table', data: await fetchDataTable(call.args?.query),
            };

          case 'get_league_standings': {
            const { league } = call.args || {};
            const safeLeague = (league || 'sports').toUpperCase();
            const queryStr = `Current ${safeLeague} regular season standings, win-loss records, and team rankings`;
            console.log(`[CHAT] Bridge Tool Triggered: Routing ${safeLeague} Standings to DataTable Agent.`);
            return {
              id: randomUUID(), type: 'DATA_TABLE', resolution_state: 'RESOLVED',
              context_summary: `${safeLeague} Standings`,
              data: await fetchDataTable(queryStr),
            };
          }

          case 'get_betting_trends': {
            const { team, trend_type } = call.args || {};
            const isAll = trend_type === 'all' || !team;

            const results = await Promise.allSettled([
              (isAll || trend_type === 'ats') ? fetchAtsRecord(ai, team).then(applyAtsFilters) : Promise.resolve(undefined),
              (isAll || trend_type === 'ou') ? fetchOuRecord(ai, team).then(applyAtsFilters) : Promise.resolve(undefined),
              (isAll || trend_type === 'runline') ? fetchRunlineRecord(ai, team).then(applyAtsFilters) : Promise.resolve(undefined),
              (isAll || trend_type === 'moneyline') ? fetchMoneylineRecord(ai, team) : Promise.resolve(undefined),
            ]);

            const getVal = (res) => res.status === 'fulfilled' ? res.value : undefined;
            const trendData = { ats: getVal(results[0]), ou: getVal(results[1]), runline: getVal(results[2]), moneyline: getVal(results[3]) };

            let angles = null;
            try {
              angles = await generateBettingAngles(ai, { team, trends: trendData });
            } catch (e) {
              console.warn(`[CHAT] Angles synthesis failed for ${team}, returning raw trends:`, e.message);
            }

            return {
              id: randomUUID(), type: 'BETTING_TRENDS', resolution_state: 'RESOLVED',
              context_summary: `${team && team !== 'all' ? team.toUpperCase() : 'League-Wide'} Betting Trends`,
              data: { ...trendData, ...(angles ? { best_bets: angles.angles, analysis_markdown: angles.analysis_markdown } : {}) },
            };
          }

          case 'get_world_cup_trends': {
            const { team, period } = call.args || {};
            const safeTeam = String(team).trim().toUpperCase();
            const safePeriod = period || 'all';
            const trends = await sportsDAL.getTeamTrendSnapshot('WORLD_CUP', safeTeam, safePeriod);
            
            const columns = ['Period', 'Win Rate', 'Goals For Avg', 'Goals Against Avg', 'Clean Sheets', 'Over 2.5', 'BTTS', 'Form 5', 'Form 10'];
            const rows = [];
            const trendsList = Array.isArray(trends) ? trends : [trends].filter(Boolean);
            
            for (const t of trendsList) {
              rows.push([
                t.period || 'all',
                t.winRate != null ? `${(t.winRate * 100).toFixed(1)}%` : '-',
                t.goalsForAvg != null ? Number(t.goalsForAvg).toFixed(2) : '-',
                t.goalsAgainstAvg != null ? Number(t.goalsAgainstAvg).toFixed(2) : '-',
                t.cleanSheetRate != null ? `${(t.cleanSheetRate * 100).toFixed(1)}%` : '-',
                t.over25Rate != null ? `${(t.over25Rate * 100).toFixed(1)}%` : '-',
                t.bttsRate != null ? `${(t.bttsRate * 100).toFixed(1)}%` : '-',
                t.form5 || '-',
                t.form10 || '-'
              ]);
            }
            
            return {
              id: randomUUID(),
              type: 'DATA_TABLE',
              resolution_state: 'RESOLVED',
              context_summary: `${safeTeam} World Cup Snapshot`,
              data: {
                title: `${safeTeam} World Cup Ingestion Snapshot`,
                columns,
                rows,
                source: 'ESPN Historical Ingestion',
              }
            };
          }

          case 'get_world_cup_historical_matches': {
            const { team, limit } = call.args || {};
            const safeTeam = String(team).trim().toUpperCase();
            const safeLimit = limit ? parseInt(String(limit), 10) : 20;
            const matches = await sportsDAL.getHistoricalMatches('WORLD_CUP', safeTeam, safeLimit);
            
            const columns = ['Date', 'Opponent', 'Result', 'Score', 'Venue', 'Competition'];
            const rows = [];
            
            for (const m of matches) {
              const dateStr = new Date(m.matchDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              rows.push([
                dateStr,
                m.opponentCode || 'UNK',
                m.result || 'D',
                `${m.goalsFor} - ${m.goalsAgainst}`,
                m.venueType || 'neutral',
                m.competition || 'Unknown'
              ]);
            }
            
            return {
              id: randomUUID(),
              type: 'DATA_TABLE',
              resolution_state: 'RESOLVED',
              context_summary: `${safeTeam} Historical matches`,
              data: {
                title: `${safeTeam} Historical Results Ledger (Last ${safeLimit} matches)`,
                columns,
                rows,
                source: 'ESPN Results',
              }
            };
          }

          case 'get_mlb_trends': {
            const { team, period } = call.args || {};
            const safePeriod = period || 'all';
            let rows = [];
            const columns = ['Team', 'Period', 'Win Rate', 'Runs For Avg', 'Runs Against Avg', 'Shutout Rate', 'Over 8.5 Rate', 'BTTS Rate', 'Form 5', 'Form 10'];

            if (team && team !== 'all') {
              const safeTeam = String(team).trim().toUpperCase();
              const trends = await sportsDAL.getTeamTrendSnapshot('MLB', safeTeam, safePeriod);
              const trendsList = Array.isArray(trends) ? trends : [trends].filter(Boolean);
              
              for (const t of trendsList) {
                rows.push([
                  safeTeam,
                  t.period || 'all',
                  t.winRate != null ? `${(t.winRate * 100).toFixed(1)}%` : '-',
                  t.goalsForAvg != null ? Number(t.goalsForAvg).toFixed(2) : '-',
                  t.goalsAgainstAvg != null ? Number(t.goalsAgainstAvg).toFixed(2) : '-',
                  t.cleanSheetRate != null ? `${(t.cleanSheetRate * 100).toFixed(1)}%` : '-',
                  t.over25Rate != null ? `${(t.over25Rate * 100).toFixed(1)}%` : '-',
                  t.bttsRate != null ? `${(t.bttsRate * 100).toFixed(1)}%` : '-',
                  t.form5 || '-',
                  t.form10 || '-'
                ]);
              }
            } else {
              const trends = await sportsDAL.getLeagueTrendSnapshots('MLB', safePeriod);
              for (const t of trends) {
                rows.push([
                  t.teamCode,
                  t.period || 'all',
                  t.winRate != null ? `${(t.winRate * 100).toFixed(1)}%` : '-',
                  t.goalsForAvg != null ? Number(t.goalsForAvg).toFixed(2) : '-',
                  t.goalsAgainstAvg != null ? Number(t.goalsAgainstAvg).toFixed(2) : '-',
                  t.cleanSheetRate != null ? `${(t.cleanSheetRate * 100).toFixed(1)}%` : '-',
                  t.over25Rate != null ? `${(t.over25Rate * 100).toFixed(1)}%` : '-',
                  t.bttsRate != null ? `${(t.bttsRate * 100).toFixed(1)}%` : '-',
                  t.form5 || '-',
                  t.form10 || '-'
                ]);
              }
            }

            return {
              id: randomUUID(),
              type: 'DATA_TABLE',
              resolution_state: 'RESOLVED',
              context_summary: team && team !== 'all' ? `${team.toUpperCase()} MLB Snapshot` : `MLB League-Wide Trends (${safePeriod})`,
              data: {
                title: team && team !== 'all' ? `${team.toUpperCase()} MLB Ingestion Snapshot` : `MLB League-Wide Historical Betting Trends (${safePeriod})`,
                columns,
                rows,
                source: 'ESPN Results',
              }
            };
          }

          case 'get_mlb_historical_matches': {
            const { team, limit } = call.args || {};
            const safeTeam = String(team).trim().toUpperCase();
            const safeLimit = limit ? parseInt(String(limit), 10) : 20;
            const matches = await sportsDAL.getHistoricalMatches('MLB', safeTeam, safeLimit);
            
            const columns = ['Date', 'Opponent', 'Result', 'Runs Scored', 'Runs Against', 'Venue', 'Competition'];
            const rows = [];
            
            for (const m of matches) {
              const dateStr = new Date(m.matchDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              rows.push([
                dateStr,
                m.opponentCode || 'UNK',
                m.result || 'D',
                m.goalsFor != null ? m.goalsFor : '-',
                m.goalsAgainst != null ? m.goalsAgainst : '-',
                m.venueType || 'neutral',
                m.competition || 'Unknown'
              ]);
            }
            
            return {
              id: randomUUID(),
              type: 'DATA_TABLE',
              resolution_state: 'RESOLVED',
              context_summary: `${safeTeam} MLB Historical Matches`,
              data: {
                title: `${safeTeam} MLB Historical Results Ledger (Last ${safeLimit} matches)`,
                columns,
                rows,
                source: 'ESPN Results',
              }
            };
          }
          default:
            return null;
        }
      } catch (err) {
        console.error(`[CHAT] Tool ${call.name} failed:`, err.message);
        return {
          id: randomUUID(), type: 'SYSTEM_MESSAGE', resolution_state: 'ERROR',
          context_summary: `Failed to process ${call.name}`,
          data: { error: err instanceof Error ? err.message : 'Unknown error' },
        };
      }
    });

    const results = await Promise.all(toolExecutions);
    for (const res of results) {
      if (res && !signal?.aborted) emitArtifacts.push(res);
    }
  }

  // ── Handle text-only responses (no tool calls) ─────────────────────────
  if (emitArtifacts.length === 0 && !signal?.aborted) {
    const text = response.text?.trim() || "I couldn't match your request, but I'm here to help.";
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.filter(c => c.web)
      .map(c => c.web) || [];

    const parsedBettingAngles = extractJsonFromMarkdown(text, 'bettingangles');
    const parsedYoutube = extractJsonFromMarkdown(text, 'youtube_media');

    if (parsedBettingAngles) {
      emitArtifacts.push({
        id: randomUUID(), type: 'BETTING_ANALYSIS', resolution_state: 'CONVERSATIONAL',
        context_summary: 'Betting Preview', data: { ...parsedBettingAngles, groundingLinks: chunks },
      });
    } else if (parsedYoutube?.query && !signal?.aborted) {
      try {
        const videos = await searchYouTubeCached(parsedYoutube.query);
        if (videos.length > 0) {
          emitArtifacts.push({
            id: randomUUID(), type: 'YOUTUBE_MEDIA', resolution_state: 'CONVERSATIONAL',
            context_summary: `Top video results for "${parsedYoutube.query}"`, data: { videos },
          });
        }
      } catch (e) {
        console.error('[CHAT] YT cache fail:', e.message);
      }
    }

    if (emitArtifacts.length === 0) {
      emitArtifacts.push({
        id: randomUUID(), type: 'SYSTEM_MESSAGE', resolution_state: 'CONVERSATIONAL',
        context_summary: text, data: { groundingLinks: chunks },
      });
    }
  }

  return emitArtifacts;
}

// ── Express Route Handler ──────────────────────────────────────────────────

function sanitizeChatInput(raw) {
  return typeof raw === 'string' ? raw.slice(0, MAX_MESSAGE_LENGTH).trim() : '';
}

export function mountChatRoute(app) {
  app.post('/api/chat', async (req, res) => {
    const abortController = new AbortController();
    req.on('close', () => {
      if (req.socket.destroyed || req.aborted) {
        abortController.abort();
      }
    });

    try {
      const { message: rawMessage, history: rawHistory } = req.body;
      const message = sanitizeChatInput(rawMessage);

      if (!message) return res.status(400).json({ error: 'Message required' });
      console.log(`[CHAT] Incoming query: "${message}"`);

      // Security: Block injection attempts
      if (BLOCKED_PATTERNS.some(p => p.test(message))) {
        console.warn(`[CHAT] Query flagged by content filter: "${message}"`);
        return res.status(400).json({
          artifacts: [{
            id: randomUUID(), type: 'SYSTEM_MESSAGE', resolution_state: 'GROUNDING_FAULT',
            context_summary: 'Your message was flagged by our content filter.', data: {},
          }],
        });
      }

      // Token Limitation via Context Size Pruning
      let currentChars = 0;
      const history = [];
      const historyArray = Array.isArray(rawHistory) ? rawHistory : [];

      for (let i = historyArray.length - 1; i >= 0; i--) {
        const h = historyArray[i];
        if (typeof h.content === 'string') {
          const contentSlice = h.content.slice(0, MAX_MESSAGE_LENGTH);
          if (currentChars + contentSlice.length > MAX_AGGREGATE_HISTORY_CHARS) break;

          currentChars += contentSlice.length;
          history.unshift({ role: h.role === 'model' ? 'model' : 'user', content: contentSlice });
        }
      }

      // Execute Intent, passing the AbortSignal down the chain
      console.log(`[CHAT] Executing processIntent for query: "${message}"...`);
      const artifacts = await processIntent(message, history, abortController.signal);
      console.log(`[CHAT] processIntent completed, returned ${artifacts.length} artifacts.`);

      if (!res.headersSent && !abortController.signal.aborted) {
        res.json({ artifacts });
      }

    } catch (e) {
      // Gracefully exit if the request was aborted by client disconnect
      if (abortController.signal.aborted || e.message === 'Client Disconnected') {
        console.log('[CHAT] Request aborted by client disconnect.');
        return;
      }

      const isTimeout = e.message === 'Engine Timeout';
      console.error('[CHAT] Route error:', e.message);

      if (!res.headersSent) {
        res.status(isTimeout ? 408 : 500).json({
          artifacts: [{
            id: randomUUID(), type: 'SYSTEM_MESSAGE', resolution_state: 'GROUNDING_FAULT',
            context_summary: isTimeout ? 'Request timed out.' : 'Engine processing interrupted.',
            data: {},
          }],
        });
      }
    }
  });
}
