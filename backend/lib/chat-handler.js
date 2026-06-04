// ============================================================================
// Chat Handler — Enterprise Gemini 3.5 Flash chat engine
// Features: AbortControllers, Zero-Leak Timeouts, LRU Caching, ReDoS Immunity
// ============================================================================

import { GoogleGenAI, Type } from '@google/genai';
import { randomUUID } from 'crypto';
import { handleSportsQuery } from './sports-handler.js';
import { handleWinProbabilityQuery } from './win-probability-handler.js';
import { handlePlayerPropQuery } from './player-prop-handler.js';
import { fetchDataTable } from './data-table-agent.js';
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

// ── Tool Declarations ─────────────────────────────────────────────────────

const sportsToolDeclaration = {
  name: 'delegate_sports_query',
  description: 'Fetches live or scheduled sports data for a specific team or league on a specific date.',
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
  description: 'Fetches real-time ATS, Over/Under, Run Line, and Moneyline betting trend records for MLB teams.',
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
  description: 'Generates a structured data table, ranking, or comparison sheet from grounded search data. Use when the user asks for a table, chart, sheet, ranking, or any tabular data view.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "The user's table/chart request, e.g. 'all 30 MLB teams by win percentage'" },
    },
    required: ['query'],
  },
};

// ── System Prompt ─────────────────────────────────────────────────────────

function buildSystemPrompt() {
  const now = new Date();
  const dateContext = now.toISOString().split('T')[0].replace(/-/g, '');
  const yearContext = now.getFullYear();

  return `You are AURA, an elite AI-native sports intelligence platform and world-class betting sharp.
TEMPORAL CONTEXT: The current year is ${yearContext}. Target modern context. Current Date: ${dateContext}

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

VOICE: Punchy. Efficient. Zero fluff. Lead with the finding that changes the decision.
Banned: leverage, optimize, streamline, unlock, elevate, holistic, robust, actionable, deep dive, seamless.`;
}

// ── ReDoS-Immune Markdown Parser ──────────────────────────────────────────
// Uses O(N) string traversal instead of vulnerable Regex backtracking.

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
    // Strip control characters that break JSON.parse
    rawJson = rawJson.replace(/[\x00-\x1F\x7F]/g, ch => {
      if (ch === '\n') return '\\n';
      if (ch === '\r') return '\\r';
      if (ch === '\t') return '\\t';
      return '';
    });
    // Fix LLM hallucinated trailing commas (e.g. "odds": 150, })
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
        location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
      });
    }
  }
  return aiClient;
}

/**
 * Processes user intent STATELESSLY with strict network abort controllers and zero-leak timers.
 * Uses generateContent with contents array instead of chats.create to avoid server-side memory bloat.
 */
export async function processIntent(message, history, signal) {
  const ai = getAiClient();

  // Stateless generation format — avoids chats.create memory bloat on server
  const contents = [
    ...(history || []).map(h => ({ role: h.role, parts: [{ text: h.content }] })),
    { role: 'user', parts: [{ text: message }] },
  ];

  if (signal?.aborted) throw new Error('Client Disconnected');

  // Zero-Leak Timeout Implementation
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
            { functionDeclarations: [sportsToolDeclaration, winProbabilityToolDeclaration, playerPropToolDeclaration, bettingTrendsToolDeclaration, dataTableToolDeclaration] },
            { googleSearch: {} },
          ],
          temperature: 0.7,
        },
      }),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeoutId); // Destroy timer immediately to prevent memory leak
  }

  if (signal?.aborted) throw new Error('Client Disconnected');

  const emitArtifacts = [];

  // ── Handle Concurrent Tool Calls ─────────────────────────────────────────
  if (response.functionCalls && response.functionCalls.length > 0) {
    const toolExecutions = response.functionCalls.map(async (call) => {
      if (signal?.aborted) return null; // Early exit on client drop

      console.log(`[CHAT] Tool triggered: ${call.name}`, call.args);

      try {
        switch (call.name) {
          case 'delegate_sports_query':
            return await handleSportsQuery(call.args);
          case 'get_win_probability':
            return await handleWinProbabilityQuery(call.args);
          case 'get_player_props':
            return await handlePlayerPropQuery(call.args);
          case 'generate_data_table':
            return {
              id: randomUUID(), type: 'DATA_TABLE', resolution_state: 'RESOLVED',
              context_summary: 'Data Table', data: await fetchDataTable(call.args?.query),
            };

          case 'get_betting_trends': {
            const { team, trend_type } = call.args || {};
            const isAll = trend_type === 'all';

            // allSettled prevents cascading failures across trend fetchers
            const results = await Promise.allSettled([
              (isAll || trend_type === 'ats') ? fetchAtsRecord(ai, team).then(applyAtsFilters) : Promise.resolve(undefined),
              (isAll || trend_type === 'ou') ? fetchOuRecord(ai, team).then(applyAtsFilters) : Promise.resolve(undefined),
              (isAll || trend_type === 'runline') ? fetchRunlineRecord(ai, team).then(applyAtsFilters) : Promise.resolve(undefined),
              (isAll || trend_type === 'moneyline') ? fetchMoneylineRecord(ai, team) : Promise.resolve(undefined),
            ]);

            const getVal = (res) => res.status === 'fulfilled' ? res.value : undefined;

            const trendData = { ats: getVal(results[0]), ou: getVal(results[1]), runline: getVal(results[2]), moneyline: getVal(results[3]) };

            // Synthesize structured betting angles from the enriched trend data
            let angles = null;
            try {
              angles = await generateBettingAngles(ai, { team, trends: trendData });
            } catch (e) {
              console.warn(`[CHAT] Angles synthesis failed for ${team}, returning raw trends:`, e.message);
            }

            return {
              id: randomUUID(), type: 'BETTING_TRENDS', resolution_state: 'RESOLVED',
              context_summary: `${team} Betting Trends`,
              data: { ...trendData, ...(angles ? { best_bets: angles.angles, analysis_markdown: angles.analysis_markdown } : {}) },
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

    // Zombie Request Prevention: If the user closes the browser mid-generation, abort downstream processes
    const abortController = new AbortController();
    req.on('close', () => {
      abortController.abort();
    });

    try {
      const { message: rawMessage, history: rawHistory } = req.body;
      const message = sanitizeChatInput(rawMessage);

      if (!message) return res.status(400).json({ error: 'Message required' });

      // Security: Block injection attempts
      if (BLOCKED_PATTERNS.some(p => p.test(message))) {
        return res.status(400).json({
          artifacts: [{
            id: randomUUID(), type: 'SYSTEM_MESSAGE', resolution_state: 'GROUNDING_FAULT',
            context_summary: 'Your message was flagged by our content filter.', data: {},
          }],
        });
      }

      // Token Limitation via Context Size Pruning
      // Walk backwards to keep the most recent context while guarding TPM quotas
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
      const artifacts = await processIntent(message, history, abortController.signal);

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
