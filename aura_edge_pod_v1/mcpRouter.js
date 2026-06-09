import crypto from 'crypto';
import { writeTrace } from './db.js';

const BLOCKED_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  /<\|system\|>/i,
];

// Permission levels
export const PERMISSION_LEVELS = {
  READ_ONLY: 'READ_ONLY',
  WRITE_DRAFT: 'WRITE_DRAFT',
  SEND_OR_MUTATE: 'SEND_OR_MUTATE',
  DESTRUCTIVE: 'DESTRUCTIVE',
  ADMIN: 'ADMIN'
};

// Static map of operation to risk tier
export const POLICY_MAPPING = {
  'manage_email.read': PERMISSION_LEVELS.READ_ONLY,
  'manage_email.search': PERMISSION_LEVELS.READ_ONLY,
  'manage_email.draft': PERMISSION_LEVELS.WRITE_DRAFT,
  'manage_email.send': PERMISSION_LEVELS.SEND_OR_MUTATE,
  'manage_email.delete': PERMISSION_LEVELS.DESTRUCTIVE,
  'calendar.create_event': PERMISSION_LEVELS.SEND_OR_MUTATE,
  'drive.delete_file': PERMISSION_LEVELS.DESTRUCTIVE
};

export class McpRouter {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
  }

  handleSseConnection(req, res) {
    const clientId = crypto.randomUUID();
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', method: 'aura/init', params: { clientId } })}\n\n`);
    const heartbeatInterval = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(heartbeatInterval); writeTrace({ type: 'MCP_SSE_DISCONNECT', actorRef: clientId }); });
  }

  async handleIncomingRpc(req, res) {
    const traceId = crypto.randomUUID();
    
    // Size limit
    if (JSON.stringify(req.body || {}).length > 64 * 1024) {
      return res.status(400).json({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload exceeded 64KB' }, traceId });
    }

    const { jsonrpc, method, params, id, serverName, routeId } = req.body;
    
    if (jsonrpc !== '2.0') {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_REQUEST', message: 'Missing or invalid jsonrpc' }, traceId });
    }
    if (!serverName) {
      return res.status(400).json({ ok: false, error: { code: 'MISSING_SERVER_NAME', message: 'serverName is required' }, traceId });
    }
    if (!method) {
      return res.status(400).json({ ok: false, error: { code: 'MISSING_METHOD', message: 'method is required' }, traceId });
    }
    if (params && typeof params !== 'object') {
      return res.status(400).json({ ok: false, error: { code: 'MALFORMED_PARAMS', message: 'params must be an object' }, traceId });
    }
    
    const operation = params?.operation;
    if (!operation) {
      return res.status(400).json({ ok: false, error: { code: 'MISSING_OPERATION', message: 'params.operation is required' }, traceId });
    }

    // Injection protection
    const paramsStr = JSON.stringify(params);
    if (BLOCKED_PATTERNS.some(p => p.test(paramsStr))) {
      return res.status(400).json({ ok: false, error: { code: 'PROMPT_INJECTION_DETECTED', message: 'Unsafe arguments blocked' }, traceId });
    }

    const session = {
      userId: req.user?.id || 'anonymous_user',
      platform: req.headers['x-platform'] || 'web',
      isAuthorized: true
    };
    
    if (!session.userId) {
      return res.status(403).json({ ok: false, error: { code: 'MISSING_AUTH_CONTEXT', message: 'Authentication required' }, traceId });
    }

    const request = {
      routeId: routeId || traceId,
      serverName,
      toolName: method,
      operation: operation,
      arguments: params,
      traceId
    };

    try {
      const result = await this.orchestrator.executeGovernedTool(session, request);
      return res.status(200).json({ jsonrpc: '2.0', result, id, traceId });
    } catch (error) {
      let code = 'EXECUTION_ERROR';
      if (error.message.includes('UNAUTHORIZED_SESSION') || error.message.includes('COMPLIANCE')) code = 'POLICY_DENIED';
      else if (error.message.includes('MCP_CONTRACT') || error.message.includes('MCP_REGISTRY')) code = 'CONTRACT_ERROR';

      // We don't leak stack traces.
      return res.status(403).json({ 
        ok: false, 
        error: { code, message: error.message.split('\\n')[0] }, 
        traceId 
      });
    }
  }
}
