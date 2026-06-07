import { createSessionManager, createSessionMiddleware, createAuthRoutes } from '@clearspace/auth';
import { SubstrateErrorCode, structuredError, Severity } from './lib/errors.js';
import * as spannerDAL from './services/db.js';
import cookieParser from 'cookie-parser';
import { mountChatRoute } from './lib/chat-handler.js';
import { mountGitHubRoutes } from './lib/github-routes.js';
import { fetchDataTable } from './lib/data-table-agent.js';
import { mountMultiToolRoute } from './lib/multitool-handler.js';

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import 'dotenv/config';
import express from 'express';
// Node 24+ native fetch is used — no import needed
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { setupWebSocketProxy } from './services/websocket.js';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

import { setupSecurity } from './middleware/security.js';
import { setupAuth, sessionManager, PROXY_HEADER } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import { requestTimeoutMiddleware } from './middleware/timeout.js';

const PORT = process?.env?.PORT || process?.env?.API_BACKEND_PORT || 5000;
const API_BACKEND_HOST = process?.env?.PORT ? "0.0.0.0" : (process?.env?.API_BACKEND_HOST || "127.0.0.1");

const GOOGLE_CLOUD_LOCATION = process?.env?.GOOGLE_CLOUD_LOCATION || 'us-central1';
const GOOGLE_CLOUD_PROJECT = process?.env?.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
if (!GOOGLE_CLOUD_PROJECT || !GOOGLE_CLOUD_LOCATION) {
  console.error("Error: Environment variables GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION must be set.");
  process.exit(1);
}

setupSecurity(app);

// --- Request Timeout Guard ---
// Fires before Cloud Run's default timeout (300s).
app.use(requestTimeoutMiddleware(280000));

// --- Standard API Body Parsers ---
// Mounted specifically to /api to prevent consuming raw request streams for /api-proxy
app.use('/api', express.json({ limit: '50mb' }));
app.use('/api', express.urlencoded({ extended: true, limit: '50mb' }));

setupAuth(app);
app.use('/api/auth', createAuthRoutes(sessionManager, express));

// --- GitHub OAuth + Repo API Routes ---
mountGitHubRoutes(app);

import proxyRoutes from './routes/proxyRoutes.js';
import dataRoutes from './routes/dataRoutes.js';
import sportsRoutes from './routes/sportsRoutes.js';
import compilerRoutes from './routes/compilerRoutes.js';
import assetsRoutes from './routes/assets.js';
import artifactRoutes from './routes/artifactRoutes.js';
import { getAccessToken } from './controllers/proxyController.js';
// --- 3. STANDARD API ROUTES ---
app.use('/api/data', dataRoutes);
app.use('/api/compiler', compilerRoutes);
app.use('/api/assets', assetsRoutes);
app.use('/artifact', artifactRoutes);
app.use('/', sportsRoutes);

// Retrofit layer for frontend World Cup widgets pointing directly to /api/world-cup
app.use('/api/world-cup', (req, res, next) => {
  req.url = req.url.replace('/', '/api/sports/WORLD_CUP/');
  next();
}, sportsRoutes);

// --- 6. PROXY ROUTES ---
// Must come last so specific routes take precedence
app.use(proxyRoutes);

// --- Gemini Chat Endpoint (direct API key, gemini-3.5-flash) ---
mountChatRoute(app);

// --- Gemini Multi-Tool Endpoint ---
mountMultiToolRoute(app);

// --- Data Table Agent Endpoint (grounded search + structured extraction) ---
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





// --- Static Frontend Serving ---
const frontendBuildPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendBuildPath));

// --- Global Body Parsers ---
// Mounted AFTER proxies to prevent consuming raw request streams intended for upstream
app.use(express.json({limit: process?.env?.API_PAYLOAD_MAX_SIZE || "7mb"}));
app.use(express.urlencoded({ extended: true, limit: process?.env?.API_PAYLOAD_MAX_SIZE || "7mb" }));

// Fallback to index.html for React routing
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

// --- Global Error Boundary ---
app.use(errorHandler);

const server = app.listen(PORT, API_BACKEND_HOST, () => {
  console.log(`Vertex AI Backend listening at http://localhost:${PORT}`);
});

setupWebSocketProxy(server, {
  sessionManager,
  getAccessToken,
  PROXY_HEADER,
  GOOGLE_CLOUD_LOCATION,
  GOOGLE_CLOUD_PROJECT
});

// Force nodemon trigger 2



// --- Graceful Shutdown ---
async function shutdown(signal) {
  console.log(`\n[Server] ${signal} received. Shutting down gracefully...`);
  try {
    await Promise.all([
      spannerDAL.closeSpanner(),
    ]);
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
