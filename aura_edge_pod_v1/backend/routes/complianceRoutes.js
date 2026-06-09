import { Router } from 'express';
import crypto from 'crypto';
import { CloudTasksClient } from '@google-cloud/tasks';
import { ComplianceGuard } from '../lib/compliance/compliance-guard.js';

export default function createComplianceRouter(db, writeTrace) {
  const router = Router();
  const guard = new ComplianceGuard();

  let tasksClient = null;
  if (process.env.NODE_ENV === 'production') {
    tasksClient = new CloudTasksClient();
  }

  router.post('/evaluate', async (req, res) => {
    try {
      const payload = req.body;
      const userId = req.user?.id || payload.user_id;

      if (userId && db && process.env.NODE_ENV === 'production') {
        try {
          const [rows] = await db.run({
            sql: "SELECT ConsentType FROM UserConsentLedger WHERE UserId = @userId AND Status = 'GRANTED'",
            params: { userId }
          });
          payload.user_consents_on_file = rows.map(r => r.toJSON ? r.toJSON().ConsentType : r.ConsentType);
        } catch (err) {
          payload.user_consents_on_file = [];
        }
      } else {
        payload.user_consents_on_file = payload.user_consents_on_file || [];
      }

      const result = await guard.evaluate(payload);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ decision: 'BLOCK', reason: error.message });
    }
  });

  router.delete('/account', async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required for account deletion.' });

    const jobId = `delete-${userId.substring(0,8)}-${crypto.randomUUID().substring(0,8)}`;
    const traceId = crypto.randomUUID();
    const now = new Date();
    const deadline = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));

    try {
      if (db) {
        await db.table('AccountDeletionJobs').insert([{
          JobId: jobId, UserId: userId, Status: 'REQUESTED', TraceId: traceId,
          RequestedAt: 'spanner.commit_timestamp()', DeadlineAt: deadline.toISOString()
        }]);
      }
      if (writeTrace) writeTrace('ACCOUNT_DELETION_REQUESTED', { userId, jobId, traceId });

      if (process.env.NODE_ENV === 'production' && tasksClient) {
        const project = process.env.GOOGLE_CLOUD_PROJECT;
        const location = process.env.CLOUD_TASKS_LOCATION;
        const queue = process.env.CLOUD_TASKS_QUEUE;
        const workerEndpoint = process.env.WORKER_ENDPOINT;
        const parent = tasksClient.queuePath(project, location, queue);

        const task = {
          name: `${parent}/tasks/${jobId}`,
          httpRequest: {
            httpMethod: 'POST', url: workerEndpoint,
            body: Buffer.from(JSON.stringify({ userId, jobId, traceId })).toString('base64'),
            headers: { 'Content-Type': 'application/json' },
            oidcToken: { serviceAccountEmail: process.env.TASK_SERVICE_ACCOUNT_EMAIL, audience: workerEndpoint }
          }
        };

        try {
          await tasksClient.createTask({ parent, task });
          if (db) await db.table('AccountDeletionJobs').update([{ JobId: jobId, Status: 'ENQUEUED' }]).catch(()=>{});
        } catch (err) {
          if (err.code === 6 || (err.message && err.message.includes('ALREADY_EXISTS'))) {
             if (db) await db.table('AccountDeletionJobs').update([{ JobId: jobId, Status: 'ENQUEUED_ALREADY' }]).catch(()=>{});
          } else {
             throw err;
          }
        }
      }

      res.status(202).json({ status: 'pending', jobId, message: 'Account deletion initiated.' });
    } catch (err) {
      if (writeTrace) writeTrace('ACCOUNT_DELETION_FAILED', { userId, error: err.message });
      res.status(500).json({ error: 'Failed to record deletion request.' });
    }
  });

  return router;
}
