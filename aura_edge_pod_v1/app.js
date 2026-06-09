import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import { db, closeDatabaseConnection, writeTrace } from './db.js';
import { GitOpsGovernance } from './gitops.js';
import { McpRegistry } from './backend/lib/orchestrator/McpRegistry.js';
import { McpClientRegistry } from './backend/lib/orchestrator/McpClientRegistry.js';
import { TrustGateService } from './backend/lib/orchestrator/TrustGateService.js';
import { AccountLedger } from './backend/lib/orchestrator/AccountLedger.js';
import { TraceWriter } from './backend/lib/orchestrator/TraceWriter.js';
import { AuraMcpOrchestrator } from './backend/lib/orchestrator/AuraMcpOrchestrator.js';
import { ComplianceGuard } from './backend/lib/compliance/compliance-guard.js';

import { McpRouter } from './mcpRouter.js';
import createAuraRouter from './routes.js';
import createComplianceRouter from './backend/routes/complianceRoutes.js';
import createLaneRouter from './backend/routes/laneRoutes.js';

const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';

if (NODE_ENV === 'production') {
  const required = ['GOOGLE_CLOUD_PROJECT', 'SPANNER_INSTANCE', 'SPANNER_DATABASE', 'CLOUD_TASKS_QUEUE', 'WORKER_ENDPOINT', 'TASK_SERVICE_ACCOUNT_EMAIL'];
  for (const req of required) {
    if (!process.env[req]) {
      console.error(`Missing required production environment variable: ${req}`);
      process.exit(1);
    }
  }
}

let CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
if (NODE_ENV === 'production' && CORS_ORIGIN === '*') {
  console.error('CORS wildcard (*) is not allowed in production credentialed flows.');
  process.exit(1);
}

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: CORS_ORIGIN, methods: ['GET', 'POST', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-pubkey', 'x-auth-signature', 'x-user-id', 'x-platform', 'hx-request', 'hx-current-url', 'hx-target', 'hx-trigger'], credentials: true }));

const apiLimiter = rateLimit({ windowMs: 60000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use('/api/', apiLimiter);
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const tokenUserId = req.headers['x-user-id'] || (req.headers['authorization'] ? req.headers['authorization'].split(' ')[1] : null);
  req.user = tokenUserId ? { id: tokenUserId } : null;
  req.platform = req.headers['x-platform'] || 'web';
  next();
});

let server;

async function bootServer() {
  try {
    console.log('Boot: verifying GitOps policy signature.');

    const gitOps = new GitOpsGovernance();
    await gitOps.loadAndVerifyPolicy();

    console.log('Policy verified. Initializing MCP orchestrator.');
    const mcpRegistry = new McpRegistry();
    const clientRegistry = new McpClientRegistry();
    const trustGateService = new TrustGateService({
      webhookUrl: process.env.WORKER_ENDPOINT || 'http://localhost:8080',
      projectId: process.env.GOOGLE_CLOUD_PROJECT || 'aura-production-2026',
      location: process.env.CLOUD_TASKS_LOCATION || 'us-central1',
      queueName: process.env.CLOUD_TASKS_QUEUE || 'aura-governed-tasks'
    }, db);
    const complianceGuard = new ComplianceGuard();
    const accountLedger = new AccountLedger();
    const traceWriter = new TraceWriter();

    // Constructor signature is (registry, clientRegistry, trustGate, compliance,
    // accountLedger, traces, gitOps). Keep this call aligned with the class.
    const orchestrator = new AuraMcpOrchestrator(
      mcpRegistry, clientRegistry, trustGateService, complianceGuard,
      accountLedger, traceWriter, gitOps
    );
    await orchestrator.init();

    const mcpRouterWrapper = new McpRouter(orchestrator);

    app.get('/healthz', async (req, res) => {
      let spannerOk = false;
      try { await db.run({ sql: 'SELECT 1' }); spannerOk = true; } catch (err) {}
      res.status(spannerOk ? 200 : 500).json({ status: spannerOk ? 'ok' : 'unavailable', database: spannerOk ? 'connected' : 'unreachable', git_commit: gitOps.cachedCommitHash || 'unknown' });
    });

    app.use('/compliance', createComplianceRouter(db, writeTrace));
    app.use('/lanes', createLaneRouter(db, writeTrace));

    app.post('/api/mcp/execute', (req, res) => mcpRouterWrapper.handleIncomingRpc(req, res));
    app.get('/sse', (req, res) => mcpRouterWrapper.handleSseConnection(req, res));

    const adminMiddleware = (req, res, next) => {
      if (process.env.ENABLE_INTERNAL_ADMIN !== 'true') {
        return res.status(403).json({ status: 'error', message: 'Forbidden: Internal admin APIs are disabled.' });
      }
      next();
    };

    app.get('/api/internal/mcp/registry', adminMiddleware, async (req, res) => {
      try {
        const servers = mcpRegistry.getEnabledServers();
        res.status(200).json({ status: 'ok', data: servers });
      } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
      }
    });

    app.get('/api/internal/mcp/traces', adminMiddleware, async (req, res) => {
      try {
        const [rows] = await db.run({ sql: 'SELECT * FROM SystemTraces ORDER BY Timestamp DESC LIMIT 50' });
        const traces = rows.map(r => {
          try { return JSON.parse(r.Metadata); } catch (e) { return {}; }
        });
        res.status(200).json({ status: 'ok', data: traces });
      } catch (err) {
        // Mock fallback if DB isn't running in dev
        res.status(200).json({ status: 'ok', data: [
          { traceId: 'mock_trace_1', actorRef: 'test-user', accountRef: 'account-123', serverName: 'workspace_google_mcp', method: 'manage_email', operation: 'read', policyDecision: 'ALLOW', riskTier: 'READ_ONLY', latencyMs: 25, resultShape: 'complete', timestamp: new Date().toISOString() }
        ]});
      }
    });

    app.get('/api/internal/mcp/policy', adminMiddleware, async (req, res) => {
      try {
        const policy = await complianceGuard.loadPolicy();
        res.status(200).json({ status: 'ok', data: policy.policies });
      } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
      }
    });

    app.use('/', createAuraRouter(gitOps, mcpRouterWrapper));

    app.use((err, req, res, next) => {
      console.error('[EXPRESS_ERROR]', err);
      if (res.headersSent) return next(err);
      res.status(500).send(`<div style="font-family: monospace; color: #ff6666;">Unexpected server error</div>`);
    });

    if (process.env.NODE_ENV !== 'test') {
      server = app.listen(PORT, () => {
        console.log(`AURA Edge Pod listening on port ${PORT} (env: ${NODE_ENV}).`);
      });
    }
  } catch (error) {
    console.error('Boot failed:', error.message);
    process.exit(1);
  }
}

async function gracefulShutdown(signal) {
  console.log(`\n[${signal}] Shutting down.`);
  if (server) await new Promise(resolve => server.close(resolve));
  try { await closeDatabaseConnection(); } catch (err) {}
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

bootServer();
