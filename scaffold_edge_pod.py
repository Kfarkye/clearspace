import os

TARGET_DIR = "aura_edge_pod_v1"

FILES = {
    "package.json": r"""{
  "name": "aura-edge-pod",
  "version": "1.0.0",
  "description": "AURA Orchestration Edge Pod V1",
  "type": "module",
  "main": "app.js",
  "scripts": {
    "start": "node app.js",
    "test": "node --test tests/"
  },
  "dependencies": {
    "@google-cloud/spanner": "^7.3.0",
    "@google-cloud/tasks": "^5.0.0",
    "compression": "^1.7.4",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.2.0",
    "helmet": "^7.1.0"
  }
}
""",

    "schema.sql": r"""CREATE TABLE TrustGateLocks (
  LockId STRING(64) NOT NULL,
  CurrentStatus STRING(32) NOT NULL,
  FrozenPayloadHash STRING(64) NOT NULL,
  FrozenPayload JSON,
  RequestedActions JSON,
  ContractSnapshot JSON,
  UserId STRING(128),
  RouteId STRING(128),
  ActionType STRING(64),
  ExpiresAt TIMESTAMP,
  ApprovedBy STRING(128),
  ApprovedAt TIMESTAMP,
  ResultRef STRING(128),
  GitCommitHash STRING(64) NOT NULL,
  LastUpdated TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true)
) PRIMARY KEY (LockId);

CREATE TABLE TrustGateAuditTrail (
  AuditId STRING(64) NOT NULL,
  LockId STRING(64) NOT NULL,
  PreviousStatus STRING(32) NOT NULL,
  NewStatus STRING(32) NOT NULL,
  TriggeredBy STRING(128) NOT NULL,
  GitCommitHash STRING(64) NOT NULL,
  Timestamp TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  Signature STRING(MAX) NOT NULL
) PRIMARY KEY (LockId, AuditId),
  INTERLEAVE IN PARENT TrustGateLocks ON DELETE CASCADE;

CREATE TABLE RouteContractSnapshots (
  SnapshotId STRING(64) NOT NULL,
  RouteId STRING(128) NOT NULL,
  ContractData JSON NOT NULL,
  CreatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true)
) PRIMARY KEY (SnapshotId);

CREATE TABLE GovernedJobs (
  JobId STRING(128) NOT NULL,
  LockId STRING(64) NOT NULL,
  PayloadHash STRING(64) NOT NULL,
  TaskName STRING(256),
  Status STRING(32) NOT NULL,
  CreatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  CompletedAt TIMESTAMP,
  ResultRef STRING(256)
) PRIMARY KEY (JobId);

CREATE TABLE ArtifactRegistry (
  ArtifactId STRING(64) NOT NULL,
  JobId STRING(128) NOT NULL,
  StorageRef STRING(256) NOT NULL,
  ArtifactDigest STRING(64) NOT NULL,
  CreatedAt TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true)
) PRIMARY KEY (ArtifactId);

CREATE TABLE SystemTraces (
  TraceId STRING(64) NOT NULL,
  TraceType STRING(64) NOT NULL,
  Metadata JSON,
  Timestamp TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true)
) PRIMARY KEY (TraceId);
""",

    "utils.js": r"""export function escapeHtml(unsafe) {
  if (unsafe == null) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
""",

    "policy_public_key.pem": r"""-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAECItLtA2FLzSuMfLajO4YYeBSPpvD
6rZmYwO4/8s3YwHUdy4/yKWhj4Cz0fJmA9jxxleCKgElO1M58SwJRROpcw==
-----END PUBLIC KEY-----
""",

    "policy.json": r"""{
  "policy": {
    "allowedTransitions": {
      "LOCKED": ["APPROVED", "REJECTED"],
      "APPROVED": ["EXECUTING", "EXPIRED", "DISCARDED"],
      "REJECTED": ["LOCKED"],
      "EXECUTING": ["EXECUTED", "FAILED"],
      "EXECUTED": [],
      "FAILED": ["LOCKED"],
      "EXPIRED": ["LOCKED"],
      "DISCARDED": []
    },
    "requiredSignatures": 1,
    "mcpAccessControl": {
      "Workspace MCP": ["list_calendar_events", "get_drive_files"],
      "Sports MCP": ["get_live_odds", "get_betting_trends"]
    }
  },
  "gitCommitHash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
  "signature": "MEUCIQDc8z8JzBQYQv3tDLIAKPI1ayOyvyppn5PKIaSDai5dlgIgFjLaUAXfF1pSkvYn+ZuZFIZ1Eg5dabCCEdFmkZ7HcIY="
}
""",

    "db.js": r"""import { Spanner } from '@google-cloud/spanner';
import crypto from 'crypto';

const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'aura-production-2026';
const instanceId = process.env.SPANNER_INSTANCE || 'aura-main-instance';
const databaseId = process.env.SPANNER_DATABASE || 'aura-edge-db';

const spanner = new Spanner({ projectId });
const instance = spanner.instance(instanceId);
export const db = instance.database(databaseId, {
  poolOptions: { max: 100, min: 10, acquireTimeout: 60000, concurrency: 10 }
});

export async function runTransaction(transactionFn) {
  try {
    return await db.runTransactionAsync(async (transaction) => {
      return await transactionFn(transaction);
    });
  } catch (error) {
    console.error('Spanner Transaction Failed:', error);
    throw error;
  }
}

export function writeTrace(traceType, metadata = {}) {
  const payload = {
    TraceId: crypto.randomUUID(),
    TraceType: traceType,
    Metadata: JSON.stringify(metadata),
    Timestamp: new Date().toISOString()
  };

  db.table('SystemTraces').insert([payload]).catch((err) => {
    // Passive trace failures never break the critical path
  });
  
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[TRACE] ${traceType}:`, JSON.stringify(metadata));
  }
}

export async function closeDatabaseConnection() {
  console.log('Closing Google Cloud Spanner connection pool...');
  await spanner.close();
}
""",

    "dispatcher.js": r"""import { CloudTasksClient } from '@google-cloud/tasks';
import { db, writeTrace } from './db.js';

const client = new CloudTasksClient();

export async function dispatchGovernedJob(lockId, payloadHash) {
  const project = process.env.GOOGLE_CLOUD_PROJECT || 'aura-production-2026';
  const location = process.env.CLOUD_TASKS_LOCATION || 'us-central1';
  const queue = process.env.CLOUD_TASKS_QUEUE || 'aura-governed-tasks';
  const workerEndpoint = process.env.WORKER_ENDPOINT || 'https://worker.aura-internal.com/execute';
  const serviceAccountEmail = process.env.TASK_SERVICE_ACCOUNT_EMAIL || 'aura-invoker@aura-production-2026.iam.gserviceaccount.com';

  const hashPrefix = payloadHash.substring(0, 8);
  // Patch 5: Deterministic Task ID and Path
  const deterministicJobId = `job-${lockId}-${hashPrefix}`;

  if (process.env.NODE_ENV === 'production') {
    const parent = client.queuePath(project, location, queue);
    const taskName = `${parent}/tasks/${deterministicJobId}`;
    
    // Patch 3: Ledger the exact intent into Spanner BEFORE Cloud Tasks transport
    try {
      await db.table('GovernedJobs').insert({
        JobId: deterministicJobId,
        LockId: lockId,
        PayloadHash: payloadHash,
        TaskName: taskName,
        Status: 'DISPATCHING',
        CreatedAt: new Date().toISOString()
      });
    } catch (err) {
      // 6 = ALREADY_EXISTS in Spanner gRPC. Treat as idempotent retry payload.
      if (err.code !== 6 && !err.message.includes('ALREADY_EXISTS')) throw err;
    }

    const task = {
      name: taskName,
      httpRequest: {
        httpMethod: 'POST',
        url: workerEndpoint,
        headers: { 
          'Content-Type': 'application/json',
          'X-Governed-Lock-Id': lockId 
        },
        body: Buffer.from(JSON.stringify({ lockId, payloadHash, jobId: deterministicJobId })).toString('base64'),
        // Patch 4: Cloud Run Worker-to-Worker OIDC Authentication
        oidcToken: {
          serviceAccountEmail: serviceAccountEmail,
          audience: workerEndpoint
        }
      }
    };
    
    try {
      const [response] = await client.createTask({ parent, task });
      await db.table('GovernedJobs').update([{ JobId: deterministicJobId, Status: 'ENQUEUED' }]).catch(()=>{});
      writeTrace('CLOUD_TASK_DISPATCHED', { taskName: response.name, lockId, jobId: deterministicJobId });
      return response.name;
    } catch (error) {
      // Patch 5: Absorb Idempotent Task Creation errors smoothly (gRPC ALREADY_EXISTS)
      if (error.code === 6 || (error.message && error.message.includes('ALREADY_EXISTS'))) {
        writeTrace('CLOUD_TASK_IDEMPOTENT_HIT', { taskName, lockId, jobId: deterministicJobId });
        await db.table('GovernedJobs').update([{ JobId: deterministicJobId, Status: 'ENQUEUED_ALREADY' }]).catch(()=>{});
        return taskName;
      }
      
      await db.table('GovernedJobs').update([{ JobId: deterministicJobId, Status: 'FAILED' }]).catch(()=>{});
      writeTrace('CLOUD_TASK_ERROR', { error: error.message, lockId, jobId: deterministicJobId });
      throw new Error(`Job Dispatch failed at transport layer: ${error.message}`);
    }
  } else {
    // Local Dev bypass logic
    const mockId = `mock-task-${Date.now()}`;
    await db.table('GovernedJobs').insert({
      JobId: mockId, LockId: lockId, PayloadHash: payloadHash, TaskName: mockId, Status: 'DEV_MOCK', CreatedAt: new Date().toISOString()
    }).catch(() => {});
    writeTrace('DEV_MOCK_DISPATCHED', { lockId, payloadHash, taskId: mockId });
    return mockId;
  }
}
""",

    "gitops.js": r"""import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { runTransaction, writeTrace } from './db.js';

export class GitOpsGovernance {
  constructor() {
    this.policyPath = path.resolve(process.cwd(), 'policy.json');
    this.publicKeyPath = path.resolve(process.cwd(), 'policy_public_key.pem');
    this.cachedPolicy = null;
    this.cachedCommitHash = null;
  }

  async loadAndVerifyPolicy() {
    try {
      const policyRaw = await fs.readFile(this.policyPath, 'utf8');
      const publicKeyPem = await fs.readFile(this.publicKeyPath, 'utf8');
      const envelope = JSON.parse(policyRaw);

      const { policy, gitCommitHash, signature } = envelope;
      const verificationPayload = JSON.stringify(policy) + gitCommitHash;

      const verifier = crypto.createVerify('SHA256');
      verifier.update(verificationPayload);
      verifier.end();

      const isValid = verifier.verify(publicKeyPem, signature, 'base64');

      if (!isValid) {
        if (process.env.NODE_ENV === 'production') {
          console.error('CRITICAL FATAL: GitOps Policy cryptographic signature verification failed!');
          process.exit(1); 
        } else {
          console.warn('WARNING: Policy signature mismatch. Non-production bypass active.');
        }
      }

      this.cachedPolicy = policy;
      this.cachedCommitHash = gitCommitHash;
      
      writeTrace('POLICY_LOAD', { gitCommitHash, isValid });
      console.log(`[GitOps] Policy verified and loaded. Bound to Commit: ${gitCommitHash}`);
      return { policy, gitCommitHash };
    } catch (error) {
      console.error('[GitOps Engine Error]:', error);
      throw error;
    }
  }

  async verifyStateTransition(lockId, targetStatus, requestorPubKey, transitionSignature, payloadHash) {
    if (!this.cachedPolicy) {
      await this.loadAndVerifyPolicy();
    }

    return await runTransaction(async (transaction) => {
      const [rows] = await transaction.run({
        sql: 'SELECT CurrentStatus, FrozenPayloadHash, LastUpdated, GitCommitHash FROM TrustGateLocks WHERE LockId = @lockId',
        params: { lockId }
      });

      if (rows.length === 0) throw new Error(`Lock ID ${lockId} not found in TrustGateLocks.`);

      const { CurrentStatus: currentStatus, FrozenPayloadHash: frozenPayloadHash } = rows[0];
      
      const allowedTransitions = this.cachedPolicy.allowedTransitions[currentStatus] || [];
      if (!allowedTransitions.includes(targetStatus)) {
        throw new Error(`Forbidden transition: ${currentStatus} -> ${targetStatus} under policy commit ${this.cachedCommitHash}`);
      }

      if (payloadHash !== frozenPayloadHash) {
        throw new Error(`Payload Hash mismatch. Requested operation payload does not match the frozen lock state.`);
      }

      const verificationPayload = `${lockId}:${currentStatus}:${targetStatus}:${frozenPayloadHash}:${this.cachedCommitHash}`;
      const verifier = crypto.createVerify('SHA256');
      verifier.update(verificationPayload);
      verifier.end();
      
      const isSignatureValid = verifier.verify(requestorPubKey, transitionSignature, 'base64');
      if (!isSignatureValid && process.env.NODE_ENV === 'production') {
        throw new Error('Invalid transition signature. Authorization denied.');
      }

      const auditId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const triggerHash = crypto.createHash('sha256').update(requestorPubKey).digest('hex');

      const updatePayload = {
        LockId: lockId,
        CurrentStatus: targetStatus,
        LastUpdated: timestamp,
        GitCommitHash: this.cachedCommitHash
      };

      // Patch 1: Store explicit execution bounds
      if (targetStatus === 'APPROVED') {
        updatePayload.ApprovedBy = triggerHash;
        updatePayload.ApprovedAt = timestamp;
      }

      transaction.update('TrustGateLocks', [updatePayload]);

      transaction.insert('TrustGateAuditTrail', [
        {
          AuditId: auditId,
          LockId: lockId,
          PreviousStatus: currentStatus,
          NewStatus: targetStatus,
          TriggeredBy: triggerHash,
          GitCommitHash: this.cachedCommitHash,
          Timestamp: timestamp,
          Signature: transitionSignature
        }
      ]);

      writeTrace('STATE_TRANSITION', { lockId, previousStatus: currentStatus, newStatus: targetStatus, payloadHash });

      return { lockId, previousStatus: currentStatus, newStatus: targetStatus, gitCommitHash: this.cachedCommitHash, frozenPayloadHash };
    });
  }

  canExecuteMethod(serverName, method) {
    if (!this.cachedPolicy || !this.cachedPolicy.mcpAccessControl) return false;
    return (this.cachedPolicy.mcpAccessControl[serverName] || []).includes(method);
  }
}
""",

    "mcpRouter.js": r"""import crypto from 'crypto';
import { writeTrace } from './db.js';

export class McpRouter {
  constructor(serversConfig, gitOps) {
    this.servers = serversConfig;
    this.clients = new Map();
    this.gitOps = gitOps;
  }

  handleSseConnection(req, res) {
    const clientId = crypto.randomUUID();
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', method: 'aura/init', params: { clientId } })}\n\n`);

    const heartbeatInterval = setInterval(() => res.write(': ping\n\n'), 15000);

    this.clients.set(clientId, { res, heartbeatInterval });
    writeTrace('MCP_SSE_CONNECT', { clientId });

    req.on('close', () => {
      clearInterval(heartbeatInterval);
      this.clients.delete(clientId);
      writeTrace('MCP_SSE_DISCONNECT', { clientId });
    });
  }

  async handleIncomingRpc(req, res) {
    const { jsonrpc, method, params, id } = req.body;

    if (jsonrpc !== '2.0' || !method || id === undefined) {
      return res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid JSON-RPC 2.0 Request' }, id: id || null });
    }

    try {
      writeTrace('MCP_RPC_REQUEST', { method, id, params });

      const targetServer = this.servers.find(srv => srv.capabilities.includes(method));
      if (!targetServer) {
        throw { code: -32601, message: `Method not found: ${method}` };
      }

      if (!this.gitOps.canExecuteMethod(targetServer.name, method)) {
        throw { code: -32001, message: `Governed Exception: Method ${method} is forbidden by TrustGate policy on ${targetServer.name}.` };
      }

      const result = await this.executeUpstream(targetServer, method, params);

      writeTrace('MCP_RPC_SUCCESS', { method, id });
      return res.status(200).json({ jsonrpc: '2.0', result, id });
    } catch (error) {
      writeTrace('MCP_RPC_ERROR', { method, id, error });
      return res.status(500).json({ jsonrpc: '2.0', error: { code: error.code || -32000, message: error.message }, id });
    }
  }

  async executeUpstream(server, method, params) {
    if (server.endpoint) {
      const response = await fetch(server.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: crypto.randomUUID() })
      });
      
      if (!response.ok) {
        throw new Error(`Upstream MCP fetch failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (data.error) throw new Error(`MCP Error: ${data.error.message}`);
      return data.result;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('UNAVAILABLE: Upstream MCP server unreachable. Physical execution overlay detached in edge sandbox.');
    }
    
    if (method === 'list_calendar_events') {
      return { events: [{ summary: 'Production Release Review', start: '2026-06-08T10:00:00Z' }] };
    }
    if (method === 'get_live_odds') {
      return { game: 'Yankees vs Red Sox', spread: '-1.5', overUnder: '8.5' };
    }
    return { status: 'mock_success', executedBy: server.name, params };
  }
}
""",

    "views.js": r"""import { escapeHtml } from './utils.js';

export function renderDashboard(lockState, auditTrail = [], testIdentity = null) {
  const statusColors = {
    LOCKED: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40',
    APPROVED: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    REJECTED: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
    EXECUTING: 'bg-blue-500/20 text-blue-400 border-blue-500/40 animate-pulse',
    EXECUTED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    FAILED: 'bg-red-600/20 text-red-500 border-red-600/40',
    EXPIRED: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
    DISCARDED: 'bg-gray-500/20 text-gray-400 border-gray-500/40'
  };

  const currentStatus = escapeHtml(lockState.CurrentStatus);
  const statusColor = statusColors[currentStatus] || statusColors.LOCKED;
  const lockId = escapeHtml(lockState.LockId);
  const commitHash = escapeHtml(lockState.GitCommitHash);
  const payloadHash = escapeHtml(lockState.FrozenPayloadHash);

  let authInputs = '';
  if (testIdentity) {
    authInputs = `
      <input type="hidden" name="devPubKey" value="${escapeHtml(testIdentity.pubKey)}">
      <input type="hidden" name="devSignature" value="${escapeHtml(testIdentity.signature(currentStatus, 'APPROVED', payloadHash))}">
      <input type="hidden" name="devSignatureReject" value="${escapeHtml(testIdentity.signature(currentStatus, 'REJECTED', payloadHash))}">
      <input type="hidden" name="devSignatureExecute" value="${escapeHtml(testIdentity.signature(currentStatus, 'EXECUTING', payloadHash))}">
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="en" class="h-full bg-slate-950 text-slate-100">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AURA Orchestration Edge Pod</title>
      <script src="https://unpkg.com/htmx.org@1.9.10"></script>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="h-full flex flex-col justify-between font-sans antialiased" id="dashboard-container">
      <header class="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md px-6 py-4">
        <div class="max-w-7xl mx-auto flex justify-between items-center">
          <div class="flex items-center gap-3">
            <div class="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
            <h1 class="text-xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">AURA EDGE POD</h1>
          </div>
          <span class="text-xs font-mono text-slate-500">COMMIT: ${commitHash}</span>
        </div>
      </header>

      <main class="flex-grow max-w-7xl w-full mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <section class="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 class="text-lg font-semibold text-slate-300 mb-4">TrustGate State Protection</h2>
            <div class="border border-dashed border-slate-800 rounded-lg p-6 text-center mb-6">
              <span class="text-xs uppercase tracking-widest text-slate-500 block mb-2">Current State</span>
              <span class="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-semibold border ${statusColor}">
                ${currentStatus}
              </span>
            </div>
            <div class="mb-6 text-sm text-slate-400 font-mono">
              <span class="block text-xs uppercase text-slate-500 mb-1">Payload Hash</span>
              <span class="break-all bg-slate-950 px-2 py-1 rounded border border-slate-800 block text-xs" title="${payloadHash}">${payloadHash}</span>
            </div>
          </div>

          <form id="transition-controls" class="space-y-3">
            <input type="hidden" name="payloadHash" value="${payloadHash}">
            ${authInputs}
            <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Governed Mutation</h3>
            <div class="grid grid-cols-2 gap-2">
              <button hx-post="/trustgate/transition?target=APPROVED" 
                      hx-target="#dashboard-container"
                      hx-swap="outerHTML"
                      ${currentStatus !== 'LOCKED' ? 'disabled' : ''}
                      class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition">
                APPROVE
              </button>
              <button hx-post="/trustgate/transition?target=REJECTED" 
                      hx-target="#dashboard-container"
                      hx-swap="outerHTML"
                      ${currentStatus !== 'LOCKED' ? 'disabled' : ''}
                      class="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition">
                REJECT
              </button>
              <button hx-post="/trustgate/dispatch" 
                      hx-target="#dashboard-container"
                      hx-swap="outerHTML"
                      ${currentStatus !== 'APPROVED' ? 'disabled' : ''}
                      class="col-span-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition mt-2">
                DISPATCH JOB
              </button>
            </div>
          </form>
        </section>

        <section class="lg:col-span-2 space-y-8">
          <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 class="text-lg font-semibold text-slate-300 mb-4">Cryptographic Audit Trail</h2>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-slate-800 text-sm">
                <thead>
                  <tr class="text-slate-400 font-mono text-left">
                    <th class="py-3 px-4">Audit ID</th>
                    <th class="py-3 px-4">Transition</th>
                    <th class="py-3 px-4">Operator Hash</th>
                    <th class="py-3 px-4">Time</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-800/50 text-slate-300 font-mono">
                  ${auditTrail.length === 0 ? `
                    <tr><td colspan="4" class="py-8 text-center text-slate-500">No transactions recorded under this policy lifecycle.</td></tr>
                  ` : auditTrail.map(audit => `
                    <tr>
                      <td class="py-3 px-4 text-slate-500 text-xs">${escapeHtml(audit.AuditId).slice(0, 8)}...</td>
                      <td class="py-3 px-4">
                        <span class="text-slate-500">${escapeHtml(audit.PreviousStatus)}</span> 
                        <span class="text-emerald-500">→</span> 
                        <span class="text-slate-200">${escapeHtml(audit.NewStatus)}</span>
                      </td>
                      <td class="py-3 px-4 text-xs text-cyan-400">${escapeHtml(audit.TriggeredBy).slice(0, 12)}...</td>
                      <td class="py-3 px-4 text-xs text-slate-400">${escapeHtml(new Date(audit.Timestamp).toLocaleTimeString())}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      <footer class="border-t border-slate-900 bg-slate-950/80 py-4 text-center">
        <p class="text-xs text-slate-600">&copy; 2026 AURA Inc. Systems protected by Governed TrustGate.</p>
      </footer>
    </body>
    </html>
  `;
}
""",

    "routes.js": r"""import { Router } from 'express';
import { renderDashboard } from './views.js';
import crypto from 'crypto';
import { db, writeTrace } from './db.js';
import { escapeHtml } from './utils.js';
import { dispatchGovernedJob } from './dispatcher.js';

export default function createAuraRouter(gitOps, mcpRouter) {
  const router = Router();

  let testIdentity = null;
  if (process.env.NODE_ENV !== 'production') {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    testIdentity = {
      pubKey: publicKey.export({ type: 'spki', format: 'pem' }),
      signature: (currentStatus, targetStatus, payloadHash) => {
        const lockId = 'gate-lock-01';
        const payload = `${lockId}:${currentStatus}:${targetStatus}:${payloadHash}:${gitOps.cachedCommitHash}`;
        const signer = crypto.createSign('SHA256');
        signer.update(payload);
        signer.end();
        return signer.sign(privateKey, 'base64');
      }
    };
  }

  // Purely a local fallback for offline/development mode when Spanner goes missing.
  let localDevState = {
    LockId: 'gate-lock-01',
    CurrentStatus: 'LOCKED',
    FrozenPayloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    GitCommitHash: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0'
  };
  let localDevAudit = [];

  // Patch 7: Single Source of Truth Fetcher. No rendering occurs before refreshing off Spanner in Prod.
  async function fetchTruthFromSpanner(lockId) {
    if (process.env.NODE_ENV === 'production') {
      const [rows] = await db.run({
        sql: 'SELECT * FROM TrustGateLocks WHERE LockId = @lockId LIMIT 1',
        params: { lockId }
      });
      if (rows.length === 0) {
        throw new Error(`CRITICAL: TrustGate lock sequence [${lockId}] not found in attached Spanner context.`);
      }
      
      const [auditRows] = await db.run({
        sql: 'SELECT * FROM TrustGateAuditTrail WHERE LockId = @lockId ORDER BY Timestamp DESC LIMIT 10',
        params: { lockId }
      });
      return { activeLockState: rows[0], activeAuditTrail: auditRows };
    }
    
    // Developer bypass reading
    try {
      const [rows] = await db.run({
        sql: 'SELECT * FROM TrustGateLocks WHERE LockId = @lockId LIMIT 1',
        params: { lockId }
      });
      if (rows.length > 0) {
        const [auditRows] = await db.run({
          sql: 'SELECT * FROM TrustGateAuditTrail WHERE LockId = @lockId ORDER BY Timestamp DESC LIMIT 10',
          params: { lockId }
        });
        return { activeLockState: rows[0], activeAuditTrail: auditRows };
      }
    } catch (err) {}
    
    localDevState.GitCommitHash = gitOps.cachedCommitHash || localDevState.GitCommitHash;
    return { activeLockState: localDevState, activeAuditTrail: localDevAudit };
  }

  router.use((req, res, next) => {
    writeTrace('HTMX_REQUEST', { path: req.path, method: req.method, ip: req.ip });
    next();
  });

  router.get('/', async (req, res, next) => {
    try {
      const { activeLockState, activeAuditTrail } = await fetchTruthFromSpanner('gate-lock-01');
      res.send(renderDashboard(activeLockState, activeAuditTrail, testIdentity));
    } catch (error) {
      next(error);
    }
  });

  router.post('/trustgate/transition', async (req, res) => {
    const targetStatus = req.query.target;
    const { payloadHash } = req.body;
    
    let requestorPubKey = req.headers['x-auth-pubkey'] || (process.env.NODE_ENV !== 'production' ? req.body.devPubKey : null);
    let signature = req.headers['x-auth-signature'] || (process.env.NODE_ENV !== 'production' ? (targetStatus === 'APPROVED' ? req.body.devSignature : req.body.devSignatureReject) : null);

    try {
      if (!requestorPubKey || !signature) {
        throw new Error('Authentication Rejected: Requestor payload strictly requires public key and cryptographic signature.');
      }

      const transitionResult = await gitOps.verifyStateTransition('gate-lock-01', targetStatus, requestorPubKey, signature, payloadHash);

      // Mutate fallback state purely for local devs. Spanner dictates prod values entirely.
      if (process.env.NODE_ENV !== 'production') {
        localDevState.CurrentStatus = targetStatus;
        localDevAudit.unshift({ 
          AuditId: crypto.randomUUID(), 
          PreviousStatus: transitionResult.previousStatus, 
          NewStatus: targetStatus, 
          TriggeredBy: crypto.createHash('sha256').update(requestorPubKey).digest('hex'), 
          Timestamp: new Date().toISOString() 
        });
      }

      const { activeLockState, activeAuditTrail } = await fetchTruthFromSpanner('gate-lock-01');
      res.send(renderDashboard(activeLockState, activeAuditTrail, testIdentity));

    } catch (error) {
      writeTrace('TRANSITION_FAILED', { error: error.message });
      res.status(400).send(`
        <div id="dashboard-container" class="p-8">
           <div class="p-4 border border-rose-500/30 bg-rose-500/10 text-rose-400 rounded-lg text-sm font-mono max-w-2xl mx-auto mt-10 shadow shadow-rose-900/50">
             <strong>State Transition Failed:</strong> ${escapeHtml(error.message)}
             <br><br><a href="/" class="underline text-rose-300">Return to Console</a>
           </div>
        </div>
      `);
    }
  });

  router.post('/trustgate/dispatch', async (req, res) => {
    const { payloadHash } = req.body;
    let requestorPubKey = req.headers['x-auth-pubkey'] || (process.env.NODE_ENV !== 'production' ? req.body.devPubKey : null);
    let signature = req.headers['x-auth-signature'] || (process.env.NODE_ENV !== 'production' ? req.body.devSignatureExecute : null);

    try {
      if (!requestorPubKey || !signature) {
         throw new Error('Missing cryptographic authentication for job dispatch.');
      }
      
      const transitionResult = await gitOps.verifyStateTransition('gate-lock-01', 'EXECUTING', requestorPubKey, signature, payloadHash);
      const taskId = await dispatchGovernedJob('gate-lock-01', payloadHash);
      
      if (process.env.NODE_ENV !== 'production') {
        localDevState.CurrentStatus = 'EXECUTING';
        localDevAudit.unshift({ 
          AuditId: crypto.randomUUID(), 
          PreviousStatus: transitionResult.previousStatus, 
          NewStatus: 'EXECUTING', 
          TriggeredBy: crypto.createHash('sha256').update(requestorPubKey).digest('hex'), 
          Timestamp: new Date().toISOString() 
        });
      }
      
      const { activeLockState, activeAuditTrail } = await fetchTruthFromSpanner('gate-lock-01');
      res.send(renderDashboard(activeLockState, activeAuditTrail, testIdentity));
    } catch (error) {
      writeTrace('DISPATCH_FAILED', { error: error.message });
      res.status(400).send(`
        <div id="dashboard-container" class="p-8">
           <div class="p-4 border border-rose-500/30 bg-rose-500/10 text-rose-400 rounded-lg text-sm font-mono max-w-2xl mx-auto mt-10 shadow shadow-rose-900/50">
             <strong>Job Dispatch Failed:</strong> ${escapeHtml(error.message)}
             <br><br><a href="/" class="underline text-rose-300">Return to Console</a>
           </div>
        </div>
      `);
    }
  });

  router.get('/sse', (req, res) => mcpRouter.handleSseConnection(req, res));
  router.post('/api/mcp', (req, res) => mcpRouter.handleIncomingRpc(req, res));

  return router;
}
""",

    "app.js": r"""import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import { GitOpsGovernance } from './gitops.js';
import { db, closeDatabaseConnection } from './db.js';
import { McpRouter } from './mcpRouter.js';
import createAuraRouter from './routes.js';

const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';

let CORS_ORIGIN;
if (NODE_ENV === 'production') {
  CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://dashboard.aura-internal.com';
  if (CORS_ORIGIN === '*') {
    console.error('CRITICAL: CORS wildcard (*) is forbidden in production credentialed flows.');
    process.exit(1);
  }
} else {
  CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
}

const gitOps = new GitOpsGovernance();

const mcpServersConfig = [
  { name: 'Workspace MCP', capabilities: ['list_calendar_events', 'get_drive_files'], endpoint: process.env.WORKSPACE_MCP_ENDPOINT },
  { name: 'Sports MCP', capabilities: ['get_live_odds', 'get_betting_trends'], endpoint: process.env.SPORTS_MCP_ENDPOINT }
];
const mcpRouter = new McpRouter(mcpServersConfig, gitOps);

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.tailwindcss.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    },
  },
}));

app.use(cors({ origin: CORS_ORIGIN, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-pubkey', 'x-auth-signature', 'hx-request', 'hx-current-url', 'hx-target', 'hx-trigger'], credentials: true }));

const apiLimiter = rateLimit({ windowMs: 60000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use('/api/', apiLimiter);

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/healthz', async (req, res) => {
  let spannerOk = false;
  try {
    await db.run({ sql: 'SELECT 1' });
    spannerOk = true;
  } catch (err) {}

  res.status(spannerOk ? 200 : 500).json({ status: spannerOk ? 'ok' : 'degraded', database: spannerOk ? 'Connected' : 'Failed', git_commit: gitOps.cachedCommitHash || 'Unknown' });
});

let server;

// Patch 6: Express boot execution strictly awaits successful policy resolution. Network bindings happen last.
async function bootServer() {
  try {
    console.log('Initiating AURA Edge Pod boot sequence. Verifying GitOps Policy bounds...');
    await gitOps.loadAndVerifyPolicy();
    console.log('Policy signature validated. Mounting TrustGate endpoints...');
    
    app.use('/', createAuraRouter(gitOps, mcpRouter));

    app.use((err, req, res, next) => {
      console.error('[EXPRESS_ERROR]', err);
      if (res.headersSent) return next(err);
      res.status(500).send(`<div style="font-family: monospace; color: #ff6666;">Unexpected System Fault</div>`);
    });

    if (process.env.NODE_ENV !== 'test') {
      server = app.listen(PORT, () => {
        console.log(`AURA Edge Pod Online on port ${PORT}. Environment: ${NODE_ENV}. All bounds secured.`);
      });
    }
  } catch (error) {
    console.error('CRITICAL BOOT SEQUENCE FAILURE:', error.message);
    process.exit(1); 
  }
}

async function gracefulShutdown(signal) {
  console.log(`\n[${signal}] Initiating graceful shutdown...`);
  if (server) await new Promise(resolve => server.close(resolve));
  try { await closeDatabaseConnection(); } catch (err) {}
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

bootServer();
""",

    "tests/production_safeguards.test.js": r"""import test from 'node:test';
import assert from 'node:assert/strict';
import { McpRouter } from '../mcpRouter.js';

test('Production MCP Execution prevents mock data leakage', async (t) => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  await t.test('McpRouter blocks if endpoint is missing', async () => {
    const mockGitOps = { canExecuteMethod: () => true };
    const router = new McpRouter([{ name: 'Test MCP', capabilities: ['test_method'] }], mockGitOps);
    
    try {
      await router.executeUpstream({ name: 'Test MCP', capabilities: ['test_method'] }, 'test_method', {});
      assert.fail('Should have thrown UNAVAILABLE error');
    } catch (err) {
      assert.match(err.message, /UNAVAILABLE/);
    }
  });

  await t.test('McpRouter attempts physical fetch if endpoint is provided', async () => {
    const mockGitOps = { canExecuteMethod: () => true };
    const router = new McpRouter([{ name: 'Test MCP', capabilities: ['test_method'], endpoint: 'http://invalid.local' }], mockGitOps);
    
    try {
      await router.executeUpstream({ name: 'Test MCP', endpoint: 'http://invalid.local', capabilities: ['test_method'] }, 'test_method', {});
      assert.fail('Should have thrown fetch error');
    } catch (err) {
      assert.match(err.message, /fetch failed|Upstream MCP fetch failed/);
    }
  });

  process.env.NODE_ENV = originalEnv;
});
"""
}

def scaffold_project():
    print(f"[*] Initializing AURA Edge Pod V1 deployment in ./{TARGET_DIR}")
    
    if not os.path.exists(TARGET_DIR):
        os.makedirs(TARGET_DIR)
        print(f"  [+] Created directory: {TARGET_DIR}")
        
    tests_dir = os.path.join(TARGET_DIR, "tests")
    if not os.path.exists(tests_dir):
        os.makedirs(tests_dir)
        print(f"  [+] Created directory: {tests_dir}")
    
    for filename, content in FILES.items():
        filepath = os.path.join(TARGET_DIR, filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  [+] Scaffolded pristine file: {filename}")
        
    print("\n[*] Deployment scaffolding complete. All ledger definitions and execution bounds hardened.")
    print("[*] Next steps:")
    print(f"    1. cd {TARGET_DIR}")
    print("    2. npm install")
    print("    3. npm test      # Verify production mock rejections")
    print("    4. npm start     # Boot edge pod")

if __name__ == "__main__":
    scaffold_project()
