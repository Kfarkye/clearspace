import { writeTrace } from '../../../db.js';
import crypto from 'crypto';

export class TraceWriter {
  async write(tracePayload) {
    writeTrace(tracePayload);
  }
  async startSpan(userId, request) {
    const traceId = `tr_${(userId || 'anon').substring(0, 8)}_${request.toolName}_${crypto.randomUUID().substring(0,8)}`;
    console.log(`[TRACE_SPAN_START] ${traceId} | user: ${userId} | op: ${request.operation}`);
    return traceId;
  }
}
