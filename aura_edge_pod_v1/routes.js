import { Router } from 'express';
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
        const payload = `gate-lock-01:${currentStatus}:${targetStatus}:${payloadHash}:${gitOps.cachedCommitHash}`;
        const signer = crypto.createSign('SHA256');
        signer.update(payload); signer.end();
        return signer.sign(privateKey, 'base64');
      }
    };
  }

  let localDevState = { LockId: 'gate-lock-01', CurrentStatus: 'LOCKED', FrozenPayloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', GitCommitHash: '0000000000000000000000000000000000000000' };
  let localDevAudit = [];

  async function fetchTruthFromSpanner(lockId) {
    if (process.env.NODE_ENV === 'production') {
      const [rows] = await db.run({ sql: 'SELECT * FROM TrustGateLocks WHERE LockId = @lockId LIMIT 1', params: { lockId } });
      if (rows.length === 0) throw new Error(`TrustGate lock [${lockId}] not found in Spanner.`);
      const [auditRows] = await db.run({ sql: 'SELECT * FROM TrustGateAuditTrail WHERE LockId = @lockId ORDER BY Timestamp DESC LIMIT 10', params: { lockId } });
      return { activeLockState: rows[0].toJSON ? rows[0].toJSON() : rows[0], activeAuditTrail: auditRows.map(r => r.toJSON ? r.toJSON() : r) };
    }
    try {
      const [rows] = await db.run({ sql: 'SELECT * FROM TrustGateLocks WHERE LockId = @lockId LIMIT 1', params: { lockId } });
      if (rows.length > 0) {
        const [auditRows] = await db.run({ sql: 'SELECT * FROM TrustGateAuditTrail WHERE LockId = @lockId ORDER BY Timestamp DESC LIMIT 10', params: { lockId } });
        return { activeLockState: rows[0].toJSON ? rows[0].toJSON() : rows[0], activeAuditTrail: auditRows.map(r => r.toJSON ? r.toJSON() : r) };
      }
    } catch (err) {}
    localDevState.GitCommitHash = gitOps.cachedCommitHash || localDevState.GitCommitHash;
    return { activeLockState: localDevState, activeAuditTrail: localDevAudit };
  }

  router.use((req, res, next) => { writeTrace('HTMX_REQUEST', { path: req.path }); next(); });

  router.get('/', async (req, res, next) => {
    try {
      const { activeLockState, activeAuditTrail } = await fetchTruthFromSpanner('gate-lock-01');
      res.send(renderDashboard(activeLockState, activeAuditTrail, testIdentity));
    } catch (error) { next(error); }
  });

  router.post('/trustgate/transition', async (req, res) => {
    const targetStatus = req.query.target;
    const { payloadHash } = req.body;
    let requestorPubKey = req.headers['x-auth-pubkey'] || (process.env.NODE_ENV !== 'production' ? req.body.devPubKey : null);
    let signature = req.headers['x-auth-signature'] || (process.env.NODE_ENV !== 'production' ? (targetStatus === 'APPROVED' ? req.body.devSignature : req.body.devSignatureReject) : null);

    try {
      if (!requestorPubKey || !signature) throw new Error('Authentication rejected.');
      const transitionResult = await gitOps.verifyStateTransition('gate-lock-01', targetStatus, requestorPubKey, signature, payloadHash);

      if (process.env.NODE_ENV !== 'production') {
        if (targetStatus === 'APPROVED' && localDevState.CurrentStatus === 'LOCKED') {
           localDevState.FrozenPayloadHash = payloadHash;
        }
        localDevState.CurrentStatus = targetStatus;
        localDevAudit.unshift({ AuditId: crypto.randomUUID(), PreviousStatus: transitionResult.previousStatus, NewStatus: targetStatus, TriggeredBy: crypto.createHash('sha256').update(requestorPubKey).digest('hex'), Timestamp: new Date().toISOString() });
      }
      const { activeLockState, activeAuditTrail } = await fetchTruthFromSpanner('gate-lock-01');
      res.send(renderDashboard(activeLockState, activeAuditTrail, testIdentity));
    } catch (error) {
      res.status(400).send(`<div class="p-8"><strong>State transition failed:</strong> ${escapeHtml(error.message)}</div>`);
    }
  });

  router.post('/trustgate/dispatch', async (req, res) => {
    const { payloadHash, manifestPayload } = req.body;
    let requestorPubKey = req.headers['x-auth-pubkey'] || (process.env.NODE_ENV !== 'production' ? req.body.devPubKey : null);
    let signature = req.headers['x-auth-signature'] || (process.env.NODE_ENV !== 'production' ? req.body.devSignatureExecute : null);

    try {
      if (!requestorPubKey || !signature) throw new Error('Missing authentication for job dispatch.');
      const transitionResult = await gitOps.verifyStateTransition('gate-lock-01', 'EXECUTING', requestorPubKey, signature, payloadHash);
      const workerResult = await dispatchGovernedJob('gate-lock-01', payloadHash, manifestPayload);

      if (process.env.NODE_ENV !== 'production') {
        localDevState.CurrentStatus = 'EXECUTING';
        localDevAudit.unshift({ AuditId: crypto.randomUUID(), PreviousStatus: transitionResult.previousStatus, NewStatus: 'EXECUTING', TriggeredBy: crypto.createHash('sha256').update(requestorPubKey).digest('hex'), Timestamp: new Date().toISOString() });
      }
      
      const isEventStream = workerResult && workerResult.headers && workerResult.headers.get('content-type')?.includes('text/event-stream');
      
      console.log('Dispatch condition check:', {
        accept: req.get('accept'),
        workerContentType: workerResult?.headers?.get('content-type'),
        isEventStream,
        workerBodyExists: workerResult ? !!workerResult.body : false
      });
      if (isEventStream && workerResult.body) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // Convert Web ReadableStream to Node stream if needed, or use async iteration
        try {
          const { Readable } = await import('stream');
          const nodeStream = Readable.fromWeb(workerResult.body);
          nodeStream.pipe(res);
        } catch (e) {
          for await (const chunk of workerResult.body) {
             res.write(chunk);
          }
          res.end();
        }
        return;
      }
      
      if (req.headers.accept === 'application/json') {
        // If the worker returns JSON
        return res.json(await workerResult.json());
      }
      const { activeLockState, activeAuditTrail } = await fetchTruthFromSpanner('gate-lock-01');
      res.send(renderDashboard(activeLockState, activeAuditTrail, testIdentity));
    } catch (error) {
      res.status(400).send(`<div class="p-8"><strong>Job dispatch failed:</strong> ${escapeHtml(error.message)}</div>`);
    }
  });

  return router;
}
