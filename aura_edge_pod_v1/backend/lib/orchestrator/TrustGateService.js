import { CloudTasksClient } from '@google-cloud/tasks';
import { writeTrace } from '../../../db.js';
import crypto from 'crypto';

// Initial lock status is PENDING. The GitOps policy defines transitions out of
// PENDING (APPROVED / REJECTED / EXPIRED). Keep this value and policy.json aligned.
const INITIAL_STATUS = 'PENDING';

export class TrustGateService {
  constructor(config, db) {
    this.tasksClient = process.env.NODE_ENV === 'production' ? new CloudTasksClient() : null;
    this.config = config;
    this.db = db;
  }

  async storeFrozenPayload(payload) {
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    console.log(`[TrustGateService] Payload frozen: ${payloadHash}`);
    return payloadHash;
  }

  async createLock(session, frozenPayload) {
    const payloadHash = await this.storeFrozenPayload(frozenPayload);
    const lockId = crypto.createHash('sha256')
      .update(`${session.userId}:${frozenPayload.routeId}:${frozenPayload.request.serverName}:${frozenPayload.request.operation}:${payloadHash}`)
      .digest('hex');

    console.log(`[TrustGateService] Lock created: ${lockId} [status: ${INITIAL_STATUS}]`);

    if (this.db && process.env.NODE_ENV === 'production') {
       try {
         await this.db.table('TrustGateLocks').insert([{
           LockId: lockId, CurrentStatus: INITIAL_STATUS, FrozenPayloadHash: payloadHash,
           FrozenPayload: JSON.stringify(frozenPayload), UserId: session.userId,
           RouteId: frozenPayload.routeId, ActionType: frozenPayload.request.operation,
           GitCommitHash: process.env.GIT_COMMIT_HASH || '0000000000000000000000000000000000000000',
           LastUpdated: 'spanner.commit_timestamp()'
         }]);
       } catch(e) { if (e.code !== 6 && !e.message.includes('ALREADY_EXISTS')) throw e; }
    }

    if (this.tasksClient && process.env.NODE_ENV === 'production') {
      const parent = this.tasksClient.queuePath(this.config.projectId, this.config.location, this.config.queueName);
      const taskPayload = JSON.stringify({
        lockId, payloadHash, userId: session.userId,
        requestSummary: { serverName: frozenPayload.request.serverName, operation: frozenPayload.request.operation }
      });
      try {
        await this.tasksClient.createTask({
          parent,
          task: {
            httpRequest: {
              httpMethod: 'POST', url: `${this.config.webhookUrl}/pending-approvals`,
              headers: { 'Content-Type': 'application/json' },
              body: Buffer.from(taskPayload).toString('base64'),
              oidcToken: { serviceAccountEmail: process.env.TASK_SERVICE_ACCOUNT_EMAIL, audience: this.config.webhookUrl }
            }
          }
        });
      } catch (e) {
        if (e.code !== 6 && !e.message.includes('ALREADY_EXISTS')) console.error(`[TrustGateService task error] ${e.message}`);
      }
    }

    writeTrace('TRUSTGATE_LOCK_CREATED', { lockId, status: INITIAL_STATUS });
    return { lockId, payloadHash, status: INITIAL_STATUS };
  }
}
