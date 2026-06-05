
import { ESPN_SPORT_MAP as SHARED_ESPN_SPORT_MAP, resolveRef as sharedResolveRef, fetchCoreApiOdds } from '@clearspace/sports-core';
import { createSessionManager, createSessionMiddleware, createAuthRoutes } from '@clearspace/auth';
import { SubstrateErrorCode, structuredError, Severity } from './lib/errors.js';
import * as spannerDAL from './spanner.js';
import cookieParser from 'cookie-parser';
import { classify, getDispatch, MODES } from './lib/router.js';
import { mountChatRoute } from './lib/chat-handler.js';

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import 'dotenv/config';
import express from 'express';
import { GoogleAuth } from 'google-auth-library';
// Node 24+ native fetch is used — no import needed
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- Security Hardening ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://accounts.google.com", "https://apis.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://a.espncdn.com", "https://*.espncdn.com", "https://lh3.googleusercontent.com"],
      connectSrc: ["'self'", "https://aiplatform.googleapis.com", "https://aiplatform.clients6.google.com", "https://accounts.google.com", "https://oauth2.googleapis.com", "https://www.googleapis.com", "https://gmail.googleapis.com", "https://people.googleapis.com", "https://storage.googleapis.com", "wss://localhost:*", "ws://localhost:*"],
      frameSrc: ["'self'", "https://accounts.google.com"],
      workerSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  // 🔒 HARDENED: HSTS forces HTTPS and prevents downgrade attacks
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
}));

// CORS: only allow requests from the Vite dev server and the served frontend
const ALLOWED_ORIGINS = [
  'http://localhost:5175',
  'http://localhost:5174',
  'http://localhost:5173',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5173',
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin, curl, server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      // Fail gracefully by omitting Access-Control headers rather than throwing 500s
      callback(null, false);
    }
  },
  credentials: true,
}));

app.use(express.json({limit: process?.env?.API_PAYLOAD_MAX_SIZE || "7mb"}));

// --- Cookie Parser (for session auth) ---
app.use(cookieParser());

// --- Session Auth (shared @clearspace/auth) ---
const sessionManager = createSessionManager();
const PROXY_HEADER = process?.env?.PROXY_HEADER;
if (!PROXY_HEADER) {
  console.error("Error: Environment variables PROXY_HEADER must be set.");
  process.exit(1);
}

const PORT = process?.env?.PORT || process?.env?.API_BACKEND_PORT || 5000;
const API_BACKEND_HOST = process?.env?.PORT ? "0.0.0.0" : (process?.env?.API_BACKEND_HOST || "127.0.0.1");

const GOOGLE_CLOUD_LOCATION = process?.env?.GOOGLE_CLOUD_LOCATION;
const GOOGLE_CLOUD_PROJECT = process?.env?.GOOGLE_CLOUD_PROJECT;
if (!GOOGLE_CLOUD_PROJECT || !GOOGLE_CLOUD_LOCATION) {
  console.error("Error: Environment variables GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION must be set.");
  process.exit(1);
}

app.set('trust proxy', 1 /* number of proxies between user and server */);

// IMPORTANT: Vertex AI Studio Rate Limiting
const proxyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many requests',
      message: 'You have exceed the request limit, please try again later.'
    },
});
app.use('/api-proxy', proxyLimiter);

// 🔒 HARDENED: Stricter rate limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' },
});
app.use('/api/auth', authLimiter);

// --- Unified Session Auth Middleware for /api-proxy/* ---
// Uses shared @clearspace/auth with dev proxy header fallback
const proxyAuthMiddleware = createSessionMiddleware(sessionManager, {
  devProxyHeader: 'x-app-proxy',
  devProxyValue: PROXY_HEADER,
});
app.use('/api-proxy', (req, res, next) => {
  // Skip the main POST /api-proxy since it has its own auth check
  if (req.method === 'POST' && req.path === '/') return next();
  return proxyAuthMiddleware(req, res, next);
});

// --- Auth Routes (shared @clearspace/auth) ---
app.use('/api/auth', createAuthRoutes(sessionManager, express));

// --- Persistent Data API Routes ---
// Protected by session auth — requires signed-in user with req.userSub
const dataAuthMiddleware = createSessionMiddleware(sessionManager, {
  devProxyHeader: 'x-app-proxy',
  devProxyValue: PROXY_HEADER,
});
app.use('/api/data', dataAuthMiddleware);

// Ensure user row exists on every authenticated data request
app.use('/api/data', async (req, res, next) => {
  try {
    const userId = req.userSub;
    if (!userId) return res.status(401).json({ error: 'Sign in required for data persistence.' });
    await spannerDAL.ensureUser({ userId, email: req.userEmail });
    req.userId = userId;
    next();
  } catch (err) {
    console.error('[Data API] ensureUser failed:', err.message);
    next(err);
  }
});

// --- Conversations ---

// List conversations
app.get('/api/data/conversations', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const conversations = await spannerDAL.getConversations(req.userId, { limit, offset });
    res.json({ conversations });
  } catch (err) { next(err); }
});

// Create conversation
app.post('/api/data/conversations', async (req, res, next) => {
  try {
    const { chatMode, initialTitle } = req.body;
    if (!chatMode || !['operator', 'standard'].includes(chatMode)) {
      return res.status(400).json({ error: 'chatMode must be "operator" or "standard".' });
    }
    const conversationId = await spannerDAL.createConversation(req.userId, chatMode, initialTitle);
    res.status(201).json({ conversationId });
  } catch (err) { next(err); }
});

// Get conversation with messages
app.get('/api/data/conversations/:id', async (req, res, next) => {
  try {
    const result = await spannerDAL.getConversation(req.userId, req.params.id);
    if (!result) return res.status(404).json({ error: 'Conversation not found.' });
    res.json(result);
  } catch (err) { next(err); }
});

// Delete conversation (soft)
app.delete('/api/data/conversations/:id', async (req, res, next) => {
  try {
    await spannerDAL.deleteConversation(req.userId, req.params.id);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// Update conversation (title and/or pin status)
app.patch('/api/data/conversations/:id', async (req, res, next) => {
  try {
    const { title, isPinned } = req.body;

    if (title !== undefined) {
      await spannerDAL.updateConversationTitle(req.userId, req.params.id, title);
    }
    if (isPinned !== undefined) {
      await spannerDAL.pinConversation(req.userId, req.params.id, !!isPinned);
    }
    if (title === undefined && isPinned === undefined) {
      return res.status(400).json({ error: 'title or isPinned is required.' });
    }

    res.json({ updated: true });
  } catch (err) { next(err); }
});

// --- Messages ---

// Append message to conversation
app.post('/api/data/conversations/:id/messages', async (req, res, next) => {
  try {
    const { role, content, hasImage } = req.body;
    if (!role || !content) {
      return res.status(400).json({ error: 'role and content are required.' });
    }
    const messageId = await spannerDAL.appendMessage(req.userId, req.params.id, {
      role,
      content,
      hasImage: hasImage || false,
    });
    res.status(201).json({ messageId });
  } catch (err) { next(err); }
});

// --- Preferences ---

// Get preferences
app.get('/api/data/preferences', async (req, res, next) => {
  try {
    const prefs = await spannerDAL.getUserPreferences(req.userId);
    res.json({ preferences: prefs || { chatMode: 'operator', thinkingMode: 'fast', theme: 'light' } });
  } catch (err) { next(err); }
});

// Update preferences (partial)
app.patch('/api/data/preferences', async (req, res, next) => {
  try {
    const { chatMode, thinkingMode, theme } = req.body;
    await spannerDAL.upsertUserPreferences(req.userId, { chatMode, thinkingMode, theme });
    res.json({ updated: true });
  } catch (err) { next(err); }
});

// --- Artifacts ---

// List artifacts
app.get('/api/data/artifacts', async (req, res, next) => {
  try {
    const type = req.query.type || undefined;
    const limit = parseInt(req.query.limit) || 20;
    const artifacts = await spannerDAL.getArtifacts(req.userId, { type, limit });
    res.json({ artifacts });
  } catch (err) { next(err); }
});

// Save artifact
app.post('/api/data/artifacts', async (req, res, next) => {
  try {
    const { conversationId, type, title, url, metadata } = req.body;
    if (!type) return res.status(400).json({ error: 'type is required.' });
    const artifactId = await spannerDAL.saveArtifact(req.userId, {
      conversationId,
      type,
      title,
      url,
      metadata,
    });
    res.status(201).json({ artifactId });
  } catch (err) { next(err); }
});

const API_CLIENT_MAP = [
 {
    name: "VertexGenAi:generateContent",
    patternForProxy: "https://aiplatform.googleapis.com/{{version}}/publishers/google/models/{{model}}:generateContent",
    getApiEndpoint: (context, params) => {
      return `https://aiplatform.clients6.google.com/${params['version']}/projects/${context.projectId}/locations/${context.region}/publishers/google/models/${params['model']}:generateContent`;
    },
    isStreaming: false,
    transformFn: null,
  },
 {
    name: "VertexGenAi:predict",
    patternForProxy: "https://aiplatform.googleapis.com/{{version}}/publishers/google/models/{{model}}:predict",
    getApiEndpoint: (context, params) => {
      return `https://aiplatform.clients6.google.com/${params['version']}/projects/${context.projectId}/locations/${context.region}/publishers/google/models/${params['model']}:predict`;
    },
    isStreaming: false,
    transformFn: null,
  },
 {
    name: "VertexGenAi:streamGenerateContent",
    patternForProxy: "https://aiplatform.googleapis.com/{{version}}/publishers/google/models/{{model}}:streamGenerateContent",
    getApiEndpoint: (context, params) => {
      return `https://aiplatform.clients6.google.com/${params['version']}/projects/${context.projectId}/locations/${context.region}/publishers/google/models/${params['model']}:streamGenerateContent`;
    },
    isStreaming: true,
    transformFn: (response) => {
        let normalizedResponse = response.trim();
        while (normalizedResponse.startsWith(',') || normalizedResponse.startsWith('[')) {
          normalizedResponse = normalizedResponse.substring(1).trim();
        }
        while (normalizedResponse.endsWith(',') || normalizedResponse.endsWith(']')) {
          normalizedResponse = normalizedResponse.substring(0, normalizedResponse.length - 1).trim();
        }

        if (!normalizedResponse.length) {
          return {result: null, inProgress: false};
        }

        if (!normalizedResponse.endsWith('}')) {
          return {result: normalizedResponse, inProgress: true};
        }

        try {
          const parsedResponse = JSON.parse(`${normalizedResponse}`);
          const transformedResponse = `data: ${JSON.stringify(parsedResponse)}\n\n`;
          return {result: transformedResponse, inProgress: false};
        } catch (error) {
          // Chunk ends with '}' but isn't valid JSON yet — still accumulating
          // across TCP boundaries. Treat as in-progress instead of crashing.
          return {result: normalizedResponse, inProgress: true};
        }
    },
  },
 {
    name: "ReasoningEngine:query",
    patternForProxy: "https://{{endpoint_location}}-aiplatform.googleapis.com/{{version}}/projects/{{project_id}}/locations/{{location_id}}/reasoningEngines/{{engine_id}}:query",
    getApiEndpoint: (context, params) => {
      return `https://${params['endpoint_location']}-aiplatform.clients6.google.com/v1beta1/projects/${params['project_id']}/locations/${params['location_id']}/reasoningEngines/${params['engine_id']}:query`;
    },
    isStreaming: false,
    transformFn: null,
  },
 {
    name: "ReasoningEngine:streamQuery",
    patternForProxy: "https://{{endpoint_location}}-aiplatform.googleapis.com/{{version}}/projects/{{project_id}}/locations/{{location_id}}/reasoningEngines/{{engine_id}}:streamQuery",
    getApiEndpoint: (context, params) => {
      return `https://${params['endpoint_location']}-aiplatform.clients6.google.com/v1beta1/projects/${params['project_id']}/locations/${params['location_id']}/reasoningEngines/${params['engine_id']}:streamQuery`;
    },
    isStreaming: true,
    transformFn: null,
  },
].map((client) => ({ ...client, patternInfo: parsePattern(client.patternForProxy) }));

// Uses Google Application Default Credentials (ADC).
// Users need to run "gcloud auth application-default login" in order to use the proxy.
const auth = new GoogleAuth({
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/tasks.readonly'
  ],
});

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePattern(pattern) {
  const paramRegex = /\{\{(.*?)\}\}/g;
  const params = [];
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = paramRegex.exec(pattern)) !== null) {
    params.push(match[1]);
    const literalPart = pattern.substring(lastIndex, match.index);
    parts.push(escapeRegex(literalPart));
    parts.push(`(?<${match[1]}>[^/]+)`);
    lastIndex = paramRegex.lastIndex;
  }
  parts.push(escapeRegex(pattern.substring(lastIndex)));
  const regexString = parts.join('');

  return {regex: new RegExp(`^${regexString}$`), params};
}

function extractParams(patternInfo, url) {
  const match = url.match(patternInfo.regex);
  if (!match) return null;
  const params = {};
  patternInfo.params.forEach((paramName, index) => {
    params[paramName] = match[index + 1];
  });
  return params;
}

async function getAccessToken(res) {
  try {
    const authClient = await auth.getClient();
    const token = await authClient.getAccessToken();
    return token.token;
  } catch (error) {
    console.error('[Node Proxy] Authentication error:', error);
    if (!res) return null;
    if (error.code === 'ERR_GCLOUD_NOT_LOGGED_IN' || (error.message && error.message.includes('Could not load the default credentials'))) {
      res.status(401).json({
        error: 'Authentication Required',
        message: 'Google Cloud Application Default Credentials not found or invalid. Please run "gcloud auth application-default login" and try again.',
      });
    } else {
      res.status(500).json({ error: `Authentication failed: ${error.message}` });
    }
    return null;
  }
}

function getRequestHeaders(accessToken) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

// NOTE: /api-proxy/workspace-token endpoint REMOVED for security.
// The GCP service account token must never be exposed to the browser.
// The Vertex AI proxy handles auth server-side via getAccessToken().

// ============================================================================
// Health Probes — Cloud Run Container Lifecycle
// Unauthenticated, fast-path. Required for managed container orchestration.
// ============================================================================

/** Liveness: confirms the process is running and not deadlocked */
app.get('/health/liveness', (req, res) => {
  res.status(200).json({ status: 'alive', system: 'TRUTH_CLEARSPACE_V1' });
});

/**
 * Readiness: deep probe — verifies Spanner session pool is viable.
 * Cloud Run uses this to determine if the container can serve traffic.
 * If Spanner is down, the container is pulled from the load balancer.
 */
app.get('/health/readiness', async (req, res) => {
  try {
    // Deep ping: execute a trivial query to validate the session pool
    const db = spannerDAL._getDatabase ? spannerDAL._getDatabase() : null;
    if (!db) {
      structuredError(SubstrateErrorCode.ACID_SYNC_FAULT, 'Spanner database handle not initialized', {}, Severity.CRITICAL);
      return res.status(503).json({ status: 'not_ready', reason: 'database_offline' });
    }

    const [rows] = await db.run({ sql: 'SELECT 1 AS probe' });
    if (!rows || rows.length === 0) {
      throw new Error('Spanner probe returned empty result');
    }

    res.status(200).json({
      status: 'ready',
      spanner: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    structuredError(SubstrateErrorCode.ACID_SYNC_FAULT, `Readiness probe failed: ${err.message}`, { stack: err.stack }, Severity.CRITICAL);
    res.status(503).json({ status: 'not_ready', reason: 'database_unreachable' });
  }
});

// --- ESPN Sports Data Proxy (Site API + Core API) ---
// Using shared sport map and ref resolver from @clearspace/sports-core
const ESPN_SPORT_MAP = SHARED_ESPN_SPORT_MAP;
const resolveRef = sharedResolveRef;

// --- ESPN Response Cache (60s TTL) ---
// 🔒 HARDENED: Reduces external API calls, prevents ESPN rate limiting at scale
const espnCache = new Map();
const ESPN_CACHE_TTL_MS = 60_000; // 60 seconds

function getCachedOrFetch(cacheKey, fetchFn) {
  const cached = espnCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < ESPN_CACHE_TTL_MS) {
    console.log(`[ESPN Cache] HIT: ${cacheKey}`);
    return { data: cached.data, fromCache: true };
  }
  return { data: null, fromCache: false };
}

function setCache(cacheKey, data) {
  espnCache.set(cacheKey, { data, timestamp: Date.now() });
  // Evict old entries (keep cache bounded)
  if (espnCache.size > 100) {
    const oldest = espnCache.keys().next().value;
    espnCache.delete(oldest);
  }
}

// Main scoreboard route — returns site API data enriched with core API odds
app.get('/api-proxy/espn/:sport', async (req, res) => {
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
});

// --- Core API Detail Route (individual event deep-dive with odds) ---
app.get('/api-proxy/espn/:sport/event/:eventId', async (req, res) => {
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
});

// --- ESPN Play-by-Play Route (game state: situation, recent plays) ---
app.get('/api-proxy/espn/:sport/event/:eventId/plays', async (req, res) => {
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
});

// --- The Odds API Route (multi-book live odds) ---
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

app.get('/api-proxy/odds/:sport', async (req, res) => {
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
});

// --- Intent Router API (Platform Module) ---
// Any frontend can call these endpoints to get intelligent routing.
// The router is decoupled from the proxy — it classifies intent and returns
// the specialist config. The frontend then includes it in the Vertex request.

app.get('/api/router/modes', (req, res) => {
  res.json({ modes: MODES });
});

app.post('/api/router/classify', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return res.status(500).json({ error: 'Failed to get access token' });

    const vertexFetch = async (body, model) => {
      const url = `https://aiplatform.clients6.google.com/v1beta1/projects/${GOOGLE_CLOUD_PROJECT}/locations/${GOOGLE_CLOUD_LOCATION}/publishers/google/models/${model}:generateContent`;
      return fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    };

    const result = await classify(message, { vertexFetch });
    const dispatch = getDispatch(result.mode);

    console.log(`[Router] Classified "${message.slice(0, 60)}..." → ${result.mode} (autoRouted: ${result.autoRouted})`);
    res.json({
      mode: result.mode,
      autoRouted: result.autoRouted,
      systemPrompt: dispatch.systemPrompt,
      temperature: dispatch.temperature,
      thinkingMode: dispatch.thinkingMode,
      thinkingBudget: dispatch.thinkingBudget,
    });
  } catch (err) {
    console.error('[Router] Classification error:', err.message);
    const fallback = getDispatch('chat');
    res.json({
      mode: 'chat',
      autoRouted: false,
      systemPrompt: fallback.systemPrompt,
      temperature: fallback.temperature,
      thinkingMode: fallback.thinkingMode,
      thinkingBudget: fallback.thinkingBudget,
    });
  }
});

// --- Gemini Chat Endpoint (direct API key, gemini-3.5-flash) ---
mountChatRoute(app);

// --- Data Table Agent Endpoint (grounded search + structured extraction) ---
import { fetchDataTable } from './lib/data-table-agent.js';

app.get('/api/data-table', async (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'Missing required query parameter.' });
  }
  try {
    const tableData = await fetchDataTable(query);
    return res.json(tableData);
  } catch (error) {
    console.error('[API] /api/data-table error:', error.message);
    return res.status(500).json({ error: 'Failed to generate data table.' });
  }
});

// --- YouTube Search Proxy ---

app.get('/api-proxy/youtube', async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing ?q= parameter' });
  }

  try {
    let ytSearch;
    try {
      ytSearch = (await import('yt-search')).default;
    } catch {
      return res.status(501).json({ error: 'yt-search not installed' });
    }

    const result = await ytSearch(query.trim());
    const videos = result.videos.slice(0, 5).map(v => ({
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail,
      author: v.author?.name,
      duration: v.timestamp,
    }));

    res.json(videos);
  } catch (error) {
    console.error('[API] YouTube search error:', error.message);
    res.status(500).json({ error: 'YouTube search failed' });
  }
});

// --- Proxy Endpoint ---

// ── Classification Cache (bounded, prevents redundant LLM calls) ────────────
const classificationCache = new Map();
const CACHE_LIMIT = 1000;
app.post('/api-proxy', async (req, res) => {
  console.log(`[Node Proxy] Received request to /api-proxy. Headers:`, req.headers);
  console.log(`[Node Proxy] PROXY_HEADER configured as: "${PROXY_HEADER}", Received x-app-proxy: "${req.headers['x-app-proxy']}"`);

  // Check for session cookie OR proxy header (dev fallback)
  const sessionCookie = req.cookies?.__session;
  let isAuthed = false;

  if (sessionCookie) {
    try {
      const decoded = sessionManager.verifySession(sessionCookie);
      req.userEmail = decoded.email;
      isAuthed = true;
    } catch (err) { /* expired or invalid */ }
  }

  if (!isAuthed && process.env.NODE_ENV !== 'production' && req.headers['x-app-proxy'] === PROXY_HEADER) {
    isAuthed = true;
  }

  if (!isAuthed) {
    return res.status(401).send('Unauthorized: Session required.');
  }

  const { originalUrl, method, headers, body } = req.body;
  if (!originalUrl) {
    return res.status(400).send('Bad Request: originalUrl is required.');
  }

  // 1. Find the matching API client
  const apiClient = API_CLIENT_MAP.find(p => {
    // We store extractedParams on req for use later if needed, though getVertexUrl takes it as arg.
    req.extractedParams = extractParams(p.patternInfo, originalUrl);
    return req.extractedParams !== null;
  });

  if (!apiClient) {
    console.error(`[Node Proxy] No API client handler found for URL: ${originalUrl}`);
    return res.status(404).json({ error: `No proxy handler found for URL: ${originalUrl}` });
  }

  const extractedParams = req.extractedParams;
  console.log(`[Node Proxy] Matched API client: ${apiClient.name}`);
  try {
    // 2. Get authenticated access token
    const accessToken = await getAccessToken(res);
    if (!accessToken) return;

    // 3. Construct the full API URL using env-set GOOGLE_CLOUD_PROJECT/LOCATION and extracted params
    const context = {projectId: GOOGLE_CLOUD_PROJECT, region: GOOGLE_CLOUD_LOCATION};
    const apiUrl = apiClient.getApiEndpoint(context, extractedParams);
    console.log(`[Node Proxy] Forwarding to Vertex API: ${apiUrl}`);

    // ── Transparent Intent Routing ──────────────────────────────────────
    // For generateContent/streamGenerateContent, classify the user's
    // intent and inject the specialist system prompt server-side.
    // Zero frontend changes — the specialist context enhances whatever
    // systemInstruction the frontend already sends.
    if (apiClient?.name?.startsWith('VertexGenAi:') && body?.contents) {
      try {
        // Extract last user message text
        const lastUserMsg = [...body.contents]
          .reverse()
          .find(c => c.role === 'user');
        const userText = lastUserMsg?.parts
          ?.find(p => p.text && !p.inlineData)?.text?.trim();

        // Fast-path bailout: skip short conversational turns ("thanks", "yes", "ok")
        if (userText && userText.length > 8) {
          let classification = classificationCache.get(userText);

          if (!classification) {
            const vertexFetch = async (classifyBody, model) => {
              const classifyUrl = `https://aiplatform.clients6.google.com/v1beta1/projects/${GOOGLE_CLOUD_PROJECT}/locations/${GOOGLE_CLOUD_LOCATION}/publishers/google/models/${model}:generateContent`;
              return fetch(classifyUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(classifyBody),
              });
            };

            classification = await classify(userText, { vertexFetch });

            // Cache management: prevent memory leak
            if (classificationCache.size >= CACHE_LIMIT) {
              classificationCache.clear();
            }
            classificationCache.set(userText, classification);
          }

          const { mode, autoRouted } = classification;

          if (autoRouted && mode !== 'chat') {
            const dispatch = getDispatch(mode);

            // Safely prepend without truncating existing multi-part system instructions
            const existingParts = body.systemInstruction?.parts || [];

            body.systemInstruction = {
              role: 'system',
              parts: [
                { text: `${dispatch.systemPrompt}\n\n` },
                ...existingParts
              ]
            };

            console.log(`[Router] Auto-routed → ${mode} (respected frontend temp/thinking configs)`);
          }
        }
      } catch (routerErr) {
        // Router failure is non-fatal — request proceeds with original prompt
        console.warn(`[Router] Classification failed, proceeding unmodified: ${routerErr.message}`);
      }
    }

    // 4. Prepare headers for the API call
    const apiHeaders = getRequestHeaders(accessToken);

    const apiFetchOptions = {
      method: method || 'POST',
      headers: {...apiHeaders, ...headers},
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    };

    // 5. Make the call to the API
    const apiResponse = await fetch(apiUrl, apiFetchOptions);

    // 6. Respond to the client based on stream type
    if (apiClient.isStreaming) {
      console.log(`[Node Proxy] Sending STREAMING response for ${apiClient.name}`);
      // Set headers for a streaming JSON response
      res.writeHead(apiResponse.status, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      });
      // Immediately send headers
      res.flushHeaders();

      if (!apiResponse.body) {
        console.error('[Node Proxy] Streaming response has no body.');
        return res.end(JSON.stringify({ error: 'Streaming response body is null' }));
      }

      // Native fetch returns a Web ReadableStream — convert to Node.js Readable
      const { Readable } = await import('stream');
      const nodeStream = Readable.fromWeb(apiResponse.body);

      const decoder = new TextDecoder();
      let deltaChunk = '';
      nodeStream.on('data', (encodedChunk) => {
        if (res.writableEnded) return; // Prevent writing after res.end()

        try {
          if (!apiClient.transformFn) {
            res.write(encodedChunk);
          } else {
            const decodedChunk = decoder.decode(encodedChunk, { stream: true });
            deltaChunk = deltaChunk + decodedChunk;

            const {result, inProgress} = apiClient.transformFn(deltaChunk);
            if (result && !inProgress) {
              deltaChunk = '';
              res.write(new TextEncoder().encode(result));
            }
          }
        } catch (error) {
          console.error(`[Node Proxy] Error processing streaming response for ${apiClient.name}`);
          console.error(error);
        }
      });

      nodeStream.on('end', () => {
        deltaChunk = '';
        console.log(`[Node Proxy] Vertex stream finished and all data processed for ${apiClient.name}`);
        res.end();
      });

      nodeStream.on('error', (streamError) => {
        console.error('[Node Proxy] Error from Vertex stream:', streamError);
        if (!res.writableEnded) {
          res.end(JSON.stringify({ proxyError: 'Stream error from Vertex AI', details: streamError.message }));
        }
      });

      res.on('error', (resError) => {
        console.error('[Node Proxy] Error writing to client response:', resError);
        if (nodeStream && typeof nodeStream.destroy === 'function') {
             nodeStream.destroy(resError);
        }
      });
    } else {
      // Non-streaming response handling
      console.log(`[Node Proxy] Sending JSON response for ${apiClient.name}`);
      const data = await apiResponse.json();
      res.status(apiResponse.status).json(data);
    }
  } catch (error) {
    console.error(`[Node Proxy] Error proxying request for ${apiClient.name}`);
    console.error(error)
    res.status(500).json({ error: error.message || 'Internal Proxy Error' });
  }
});

// --- Static Frontend Serving ---
const frontendBuildPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendBuildPath));

// Fallback to index.html for React routing
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

const server = app.listen(PORT, API_BACKEND_HOST, () => {
  console.log(`Vertex AI Backend listening at http://localhost:${PORT}`);
});


const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', async (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === '/ws-proxy') {

    // 🔒 HARDENED: Authenticate WebSocket upgrades via session cookie
    const cookies = {};
    (request.headers.cookie || '').split(';').forEach(c => {
      const [k, ...v] = c.trim().split('=');
      if (k) cookies[k] = v.join('=');
    });

    const sessionCookie = cookies['__session'];
    let wsAuthed = false;

    if (sessionCookie) {
      try {
        sessionManager.verifySession(sessionCookie);
        wsAuthed = true;
      } catch (err) { /* expired or invalid */ }
    }

    // Dev-only fallback: allow if PROXY_HEADER matches via query param
    if (!wsAuthed && process.env.NODE_ENV !== 'production') {
      const proxyAuth = url.searchParams.get('auth');
      if (proxyAuth === PROXY_HEADER) wsAuthed = true;
    }

    if (!wsAuthed) {
      console.warn('[Node Proxy] WebSocket upgrade rejected: no valid session');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    
    let targetUrl = url.searchParams.get('target');
    if (!targetUrl) {
      console.log('[Node Proxy] Missing target URL');
      socket.destroy();
      return;
    }

    if (targetUrl === 'wss://aiplatform.googleapis.com//ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent') {
      const location = GOOGLE_CLOUD_LOCATION === 'global' ? 'us-central1' : GOOGLE_CLOUD_LOCATION;
      targetUrl = `wss://${location}-aiplatform.googleapis.com//ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
    } else {
      console.log('[Node Proxy] Invalid target URL');
      socket.destroy();
      return;
    }

    let accessToken;

    try {
      accessToken = await getAccessToken();
      if (!accessToken) throw new Error('No token');
    } catch (err) {
      console.log('[Node Proxy] Authentication failed');
      socket.destroy();
      return;
    }

    console.log(`[Node Proxy] Initiating upstream connection to: ${targetUrl}`);

    let upstreamWs;

    try {
      upstreamWs = new WebSocket(targetUrl, {
        headers: getRequestHeaders(accessToken)
      });
    } catch (e) {
      console.error('[Node Proxy] Invalid Upstream URL');
      socket.destroy();
      return;
    }

    const initialErrorHandler = (error) => {
      console.error('[Node Proxy] Upstream connection failed:', error);
      upstreamWs.removeListener('open', onUpstreamOpen);

      if (socket.writable) {
        socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        socket.destroy();
      }
    };

    upstreamWs.once('error', initialErrorHandler);

    // 5. Handle Successful Upstream Connection
    const onUpstreamOpen = () => {
      // Remove the "bootstrapping" error handler
      upstreamWs.removeListener('error', initialErrorHandler);

      if (socket.destroyed) {
        console.warn('[Node Proxy] Client socket closed before upstream connection opened');
        upstreamWs.close(1000, 'Client disconnected early');
        return;
      }

      // Perform the HTTP -> WebSocket upgrade for the Client
      wss.handleUpgrade(request, socket, head, (ws) => {

        upstreamWs.on('message', (data, isBinary) => {
          const logMsg = isBinary ? '<Binary Data>' : data.toString();
          console.log(`[Upstream -> Client] [${new Date().toISOString()}]: ${logMsg}`);

          if (ws.readyState === WebSocket.OPEN) {
            if (data === undefined || data === null) {
              console.warn('[Node Proxy] Attempted to send undefined/null data to client');
              return;
            }
            ws.send(data, { binary: isBinary });
          }
        });

        ws.on('message', (data, isBinary) => {
          // 🔒 HARDENED: Cap WebSocket message size at 1MB to prevent abuse
          const MAX_WS_MSG_SIZE = 1 * 1024 * 1024; // 1MB
          if (data && data.length > MAX_WS_MSG_SIZE) {
            console.warn(`[Node Proxy] WebSocket message too large (${data.length} bytes). Closing.`);
            ws.close(1009, 'Message too large');
            return;
          }

          const logMsg = isBinary ? '<Binary Data>' : data.toString();

          let dataJson = {};
          try {
            dataJson = JSON.parse(data.toString());
          } catch (error) {
            console.error('[Node Proxy] Failed to parse message from client:', error);
            ws.close(1011, 'Failed to parse message');
          }

          if (dataJson['setup']) {
            dataJson['setup']['model'] = `projects/${GOOGLE_CLOUD_PROJECT}/locations/${GOOGLE_CLOUD_LOCATION}/${dataJson['setup']['model']}`;
          }

          if (upstreamWs.readyState === WebSocket.OPEN) {
            upstreamWs.send(JSON.stringify(dataJson), { binary: false });
          }
        });

        upstreamWs.on('error', (error) => {
          console.error('[Node Proxy] Upstream error:', error);
          const reason = error.message ? error.message.substring(0, 100) : 'Upstream error';
          ws.close(1011, reason);
        });

        upstreamWs.on('close', (code, reason) => {
          console.log(`[Node Proxy] Upstream closed: ${code} ${reason}`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(code, reason);
          }
        });

        ws.on('error', (error) => {
          console.error('[Node Proxy] Client error:', error);
          const reason = error.message ? error.message.substring(0, 100) : 'Client error';
          upstreamWs.close(1011, reason);
        });

        ws.on('close', (code, reason) => {
          console.log(`[Node Proxy] Client closed: ${code} ${reason}`);
          if (upstreamWs.readyState === WebSocket.OPEN) {
            upstreamWs.close(1000, reason);
          }
        });

        wss.emit('connection', ws, request);
      });
    };

    upstreamWs.once('open', onUpstreamOpen);

  } else {
    // Path did not match
    socket.destroy();
  }
});

// Force nodemon trigger 2

// ============================================================================
// Deploy HTML Artifact to Cloud Storage (Serverless Static Hosting)
// POST /api-proxy/deploy-html
// Body: { html: string, title?: string }
// Returns: { url: string, objectName: string }
// ============================================================================
const DEPLOY_BUCKET = process.env.DEPLOY_BUCKET || 'clearspace-artifacts';

app.post('/api-proxy/deploy-html', async (req, res) => {
  try {
    const { html, title } = req.body;

    if (!html || typeof html !== 'string') {
      return res.status(400).json({ error: 'html field is required and must be a string.' });
    }

    if (html.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'HTML content exceeds 2MB limit.' });
    }

    // Generate a URL-safe slug from title
    const cleanTitle = (title || 'artifact')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60);
    const timestamp = Date.now().toString(36);
    const objectName = `${cleanTitle}-${timestamp}.html`;

    // Get ADC token for GCS upload
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse?.token;

    if (!accessToken) {
      throw new Error('Failed to obtain access token for Cloud Storage.');
    }

    // Upload via GCS JSON API (no SDK needed)
    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${DEPLOY_BUCKET}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
      body: html,
    });

    if (!uploadResponse.ok) {
      const errorBody = await uploadResponse.text().catch(() => '');
      throw new Error(`GCS upload failed (${uploadResponse.status}): ${errorBody}`);
    }

    const publicUrl = `https://storage.googleapis.com/${DEPLOY_BUCKET}/${encodeURIComponent(objectName)}`;
    
    console.log(`[Deploy] Artifact deployed: ${publicUrl}`);
    res.json({ url: publicUrl, objectName });

  } catch (err) {
    console.error('[Deploy] Failed:', err.message);
    res.status(500).json({ error: err.message || 'Deployment failed.' });
  }
});

// 🔒 HARDENED: Centralized error handler — hides stack traces in production
app.use((err, req, res, next) => {
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'An internal error occurred.'
      : err.message,
  });
});

// --- Graceful Shutdown ---
async function shutdown(signal) {
  console.log(`\n[Server] ${signal} received. Shutting down gracefully...`);
  try {
    await spannerDAL.closeSpanner();
  } catch (e) {
    console.error('[Server] Error closing Spanner:', e.message);
  }
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });
  // Force exit after 5s if connections don't close
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
