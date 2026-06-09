import fs from 'fs/promises';
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
      // Signature verification is enforced in all environments. If you edit
      // policy.json, re-sign it with scripts/sign-policy.js or boot will fail.
      throw new Error('GitOps policy signature verification failed. Re-sign policy.json with scripts/sign-policy.js.');
    }

    this.cachedPolicy = policy;
    this.cachedCommitHash = gitCommitHash;

    writeTrace('POLICY_LOAD', { gitCommitHash, isValid });
    return { policy, gitCommitHash };
  }

  async verifyStateTransition(lockId, targetStatus, requestorPubKey, transitionSignature, payloadHash) {
    if (!this.cachedPolicy) await this.loadAndVerifyPolicy();

    return await runTransaction(async (transaction) => {
      const [rows] = await transaction.run({
        sql: 'SELECT CurrentStatus, FrozenPayloadHash, LastUpdated, GitCommitHash FROM TrustGateLocks WHERE LockId = @lockId',
        params: { lockId }
      });

      if (rows.length === 0) {
        if (process.env.NODE_ENV !== 'production') {
          return { lockId, previousStatus: 'LOCKED', newStatus: targetStatus, gitCommitHash: this.cachedCommitHash, frozenPayloadHash: payloadHash };
        }
        throw new Error(`Lock ID ${lockId} not found in TrustGateLocks.`);
      }
      const rowData = rows[0].toJSON ? rows[0].toJSON() : rows[0];
      const currentStatus = rowData.CurrentStatus;
      const frozenPayloadHash = rowData.FrozenPayloadHash;

      const allowedTransitions = this.cachedPolicy.allowedTransitions[currentStatus] || [];
      if (!allowedTransitions.includes(targetStatus)) throw new Error(`Forbidden transition: ${currentStatus} -> ${targetStatus}`);
      if (payloadHash !== frozenPayloadHash) throw new Error(`Payload hash mismatch.`);

      const verificationPayload = `${lockId}:${currentStatus}:${targetStatus}:${frozenPayloadHash}:${this.cachedCommitHash}`;
      const verifier = crypto.createVerify('SHA256');
      verifier.update(verificationPayload);
      verifier.end();

      const isSignatureValid = verifier.verify(requestorPubKey, transitionSignature, 'base64');
      if (!isSignatureValid && process.env.NODE_ENV === 'production') throw new Error('Invalid transition signature. Authorization denied.');

      const auditId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const triggerHash = crypto.createHash('sha256').update(requestorPubKey).digest('hex');

      const updatePayload = { LockId: lockId, CurrentStatus: targetStatus, LastUpdated: 'spanner.commit_timestamp()', GitCommitHash: this.cachedCommitHash };
      if (targetStatus === 'APPROVED') {
        updatePayload.ApprovedBy = triggerHash;
        updatePayload.ApprovedAt = 'spanner.commit_timestamp()';
      }

      transaction.update('TrustGateLocks', [updatePayload]);
      transaction.insert('TrustGateAuditTrail', [{
        AuditId: auditId, LockId: lockId, PreviousStatus: currentStatus, NewStatus: targetStatus,
        TriggeredBy: triggerHash, GitCommitHash: this.cachedCommitHash, Timestamp: 'spanner.commit_timestamp()', Signature: transitionSignature
      }]);

      writeTrace('STATE_TRANSITION', { lockId, previousStatus: currentStatus, newStatus: targetStatus, payloadHash });
      return { lockId, previousStatus: currentStatus, newStatus: targetStatus, gitCommitHash: this.cachedCommitHash, frozenPayloadHash };
    });
  }
}
