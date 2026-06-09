import crypto from 'crypto';
import { CloudTasksClient } from '@google-cloud/tasks';

export class DeepResearchLane {
  constructor(db, writeTrace) {
    this.db = db;
    this.writeTrace = writeTrace;
    this.tasksClient = process.env.NODE_ENV === 'production' ? new CloudTasksClient() : null;
  }
  async dispatchDeepResearch(userId, query) {
    const jobId = `res-${crypto.randomUUID().substring(0, 16)}`;
    if (this.db && process.env.NODE_ENV === 'production') {
      await this.db.table('ResearchJobs').insert([{
        JobId: jobId, UserId: userId, Query: query, Status: 'QUEUED', CreatedAt: 'spanner.commit_timestamp()', UpdatedAt: 'spanner.commit_timestamp()'
      }]);
    }
    if (this.tasksClient && process.env.NODE_ENV === 'production') {
      const project = process.env.GOOGLE_CLOUD_PROJECT;
      const location = process.env.CLOUD_TASKS_LOCATION;
      const queue = process.env.CLOUD_TASKS_QUEUE;
      const workerEndpoint = process.env.RESEARCH_WORKER_ENDPOINT || 'https://worker.aura-internal.com/research/execute';

      const parent = this.tasksClient.queuePath(project, location, queue);
      const taskName = `${parent}/tasks/${jobId}`;

      const task = {
        name: taskName,
        httpRequest: {
          httpMethod: 'POST', url: workerEndpoint, body: Buffer.from(JSON.stringify({ jobId, userId, query })).toString('base64'),
          headers: { 'Content-Type': 'application/json' }, oidcToken: { serviceAccountEmail: process.env.TASK_SERVICE_ACCOUNT_EMAIL, audience: workerEndpoint }
        }
      };

      try {
        await this.tasksClient.createTask({ parent, task });
      } catch (err) {
        if (err.code !== 6 && !err.message.includes('ALREADY_EXISTS')) {
          await this.db.table('ResearchJobs').update([{ JobId: jobId, Status: 'FAILED', ErrorMessage: err.message, UpdatedAt: 'spanner.commit_timestamp()' }]).catch(()=>{});
          throw err;
        }
      }
    }
    if (this.writeTrace) this.writeTrace('RESEARCH_DISPATCHED', { jobId, userId, query });
    return { jobId, status: 'QUEUED', message: 'Deep research queued.' };
  }
}
