import { CloudTasksClient } from '@google-cloud/tasks';
import { db, writeTrace } from './db.js';

const client = process.env.NODE_ENV === 'production' ? new CloudTasksClient() : null;

export async function dispatchGovernedJob(lockId, payloadHash, manifestPayload) {
  const project = process.env.GOOGLE_CLOUD_PROJECT || 'aura-production-2026';
  const location = process.env.CLOUD_TASKS_LOCATION || 'us-central1';
  const queue = process.env.CLOUD_TASKS_QUEUE || 'aura-governed-tasks';
  const workerEndpoint = process.env.WORKER_ENDPOINT || 'https://worker.aura-internal.com/execute';
  const serviceAccountEmail = process.env.TASK_SERVICE_ACCOUNT_EMAIL;

  const hashPrefix = payloadHash.substring(0, 8);
  const deterministicJobId = `job-${lockId}-${hashPrefix}`;

  if (process.env.NODE_ENV === 'production' && client) {
    if (!serviceAccountEmail) throw new Error('Missing TASK_SERVICE_ACCOUNT_EMAIL');
    const parent = client.queuePath(project, location, queue);
    const taskName = `${parent}/tasks/${deterministicJobId}`;

    try {
      await db.table('GovernedJobs').insert([{ JobId: deterministicJobId, LockId: lockId, PayloadHash: payloadHash, TaskName: taskName, Status: 'DISPATCHING', CreatedAt: 'spanner.commit_timestamp()' }]);
    } catch (err) {
      if (err.code !== 6 && !err.message.includes('ALREADY_EXISTS')) throw err;
    }

    const task = {
      name: taskName,
      httpRequest: {
        httpMethod: 'POST', url: workerEndpoint, headers: { 'Content-Type': 'application/json', 'X-Governed-Lock-Id': lockId },
        body: Buffer.from(JSON.stringify(manifestPayload || { lockId, payloadHash, jobId: deterministicJobId })).toString('base64'),
        oidcToken: { serviceAccountEmail, audience: workerEndpoint }
      }
    };

    try {
      const [response] = await client.createTask({ parent, task });
      await db.table('GovernedJobs').update([{ JobId: deterministicJobId, Status: 'ENQUEUED' }]).catch(()=>{});
      writeTrace('CLOUD_TASK_DISPATCHED', { taskName: response.name, lockId, jobId: deterministicJobId });
      return response.name;
    } catch (error) {
      if (error.code === 6 || (error.message && error.message.includes('ALREADY_EXISTS'))) {
        writeTrace('CLOUD_TASK_IDEMPOTENT_HIT', { taskName, lockId, jobId: deterministicJobId });
        await db.table('GovernedJobs').update([{ JobId: deterministicJobId, Status: 'ENQUEUED_ALREADY' }]).catch(()=>{});
        return taskName;
      }
      await db.table('GovernedJobs').update([{ JobId: deterministicJobId, Status: 'FAILED' }]).catch(()=>{});
      throw new Error(`Job dispatch failed at transport layer: ${error.message}`);
    }
  } else {
    const mockId = `mock-task-${Date.now()}`;
    if (db) await db.table('GovernedJobs').insert([{ JobId: mockId, LockId: lockId, PayloadHash: payloadHash, TaskName: mockId, Status: 'DEV_MOCK', CreatedAt: 'spanner.commit_timestamp()' }]).catch(() => {});
    writeTrace('DEV_MOCK_DISPATCHED', { lockId, payloadHash, taskId: mockId });
    
    try {
      const response = await fetch(workerEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Governed-Lock-Id': lockId },
        body: JSON.stringify(manifestPayload || { lockId, payloadHash, jobId: mockId })
      });
      if (!response.ok) throw new Error(`Worker fetch failed: ${response.statusText}`);
      return response;
    } catch (e) {
      console.error('Dev worker fetch failed:', e);
    }
    
    return { mockId };
  }
}
