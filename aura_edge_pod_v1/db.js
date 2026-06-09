import { Spanner } from '@google-cloud/spanner';
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
  try { return await db.runTransactionAsync(async (transaction) => { return await transactionFn(transaction); }); }
  catch (error) { console.error('Spanner transaction failed:', error); throw error; }
}

export function writeTrace(tracePayload) {
  // Extract trace ID from payload or generate one. Ensure no raw payloads leak in here.
  const traceId = tracePayload.traceId || crypto.randomUUID();
  
  // Format the structured investor-grade trace
  const structuredMetadata = {
    traceId,
    actorRef: tracePayload.actorRef || 'anonymous',
    accountRef: tracePayload.accountRef || 'unresolved',
    serverName: tracePayload.serverName || 'unknown_server',
    method: tracePayload.method || 'unknown_method',
    operation: tracePayload.operation || 'unknown_operation',
    policyDecision: tracePayload.policyDecision || 'UNKNOWN',
    riskTier: tracePayload.riskTier || 'UNKNOWN',
    latencyMs: tracePayload.latencyMs || 0,
    resultShape: tracePayload.resultShape || 'UNKNOWN',
    redactionVersion: tracePayload.redactionVersion || 'v1'
  };

  const payload = { 
    TraceId: traceId, 
    TraceType: tracePayload.type || 'EXECUTION_TRACE', 
    Metadata: JSON.stringify(structuredMetadata), 
    Timestamp: 'spanner.commit_timestamp()' 
  };

  db.table('SystemTraces').insert([payload]).catch(() => {});
  if (process.env.NODE_ENV !== 'test') console.log(`[TRACE] ${payload.TraceType}:`, JSON.stringify(structuredMetadata));
}

export async function closeDatabaseConnection() { await spanner.close(); }
