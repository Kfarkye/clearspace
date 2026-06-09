import { POLICY_MAPPING } from '../../../mcpRouter.js';

export class AuraMcpOrchestrator {
  constructor(registry, clientRegistry, trustGate, compliance, accountLedger, traces, gitOps) {
    this.registry = registry;
    this.clientRegistry = clientRegistry;
    this.trustGate = trustGate;
    this.compliance = compliance;
    this.accountLedger = accountLedger;
    this.traces = traces;
    this.gitOps = gitOps;
  }

  async init() {
    console.log("[AURA Orchestrator] Initializing MCP plane.");
    await this.registry.load();
    await this.clientRegistry.connectAll(this.registry.getEnabledServers());
    console.log("[AURA Orchestrator] MCP plane ready.");
  }

  async executeGovernedTool(session, request) {
    const startTime = Date.now();
    
    if (!session || !session.isAuthorized) {
      throw new Error('UNAUTHORIZED_SESSION: Access denied.');
    }

    const contract = this.registry.resolve(request.serverName, request.toolName, request.operation);
    const resolvedOperation = contract.resolvedOperation;

    const riskTier = POLICY_MAPPING[`${request.toolName}.${request.operation}`] || 'UNKNOWN';

    const complianceContext = {
      userId: session.userId, platform: session.platform, routeId: request.routeId,
      toolName: request.toolName, operation: request.operation, sideEffect: resolvedOperation.side_effect
    };

    const complianceOutcomeObj = await this.compliance.evaluate(complianceContext);
    const decision = typeof complianceOutcomeObj === 'string' ? complianceOutcomeObj : complianceOutcomeObj.decision;

    const baseTrace = {
      traceId: request.traceId || request.routeId,
      actorRef: session.userId,
      serverName: request.serverName,
      method: request.toolName,
      operation: request.operation,
      policyDecision: decision,
      riskTier,
      redactionVersion: 'v1.1'
    };

    if (decision === 'BLOCK') {
      await this.traces.write({ ...baseTrace, type: 'COMPLIANCE_BLOCKED', resultShape: 'ERROR' });
      throw new Error(`COMPLIANCE_VIOLATION: Operation '${request.operation}' blocked. ${complianceOutcomeObj.reason || ''}`);
    }
    if (decision !== 'ALLOW') {
      await this.traces.write({ ...baseTrace, type: 'COMPLIANCE_ACTION_REQUIRED', resultShape: 'ACTION_REQUIRED' });
      throw new Error(`COMPLIANCE_ACTION_REQUIRED: Operation '${request.operation}' requires ${decision}.`);
    }

    const accountRef = await this.accountLedger.resolveAccountRef(session.userId, request.serverName);
    baseTrace.accountRef = accountRef;
    
    const frozenPayload = { request, accountRef, routeId: request.routeId, contractVersion: contract.package_version_url || 'v1.0.0' };

    if (resolvedOperation.trustgate) {
      const lock = await this.trustGate.createLock(session, frozenPayload);
      await this.traces.write({ ...baseTrace, type: 'TRUSTGATE_LOCKED', resultShape: 'PENDING_APPROVAL' });
      return { status: 'PENDING_APPROVAL', message: 'This action requires explicit approval.', lockId: lock.lockId, payloadHash: lock.payloadHash };
    }

    const mcpClient = this.clientRegistry.get(request.serverName);
    const traceId = request.traceId || await this.traces.startSpan(session.userId, request);
    baseTrace.traceId = traceId;

    try {
      const mcpArguments = { ...request.arguments, accountRef, traceId, operation: request.operation };
      const executionResult = await mcpClient.callTool({ name: request.toolName, arguments: mcpArguments });

      const normalizedResult = this.normalizeMcpResult(executionResult);
      const latencyMs = Date.now() - startTime;
      
      await this.traces.write({ 
        ...baseTrace, 
        type: 'MCP_EXECUTION_SUCCESS', 
        latencyMs, 
        resultShape: normalizedResult.status 
      });
      return normalizedResult;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      await this.traces.write({ 
        ...baseTrace, 
        type: 'MCP_EXECUTION_FAILED', 
        latencyMs, 
        resultShape: 'ERROR' 
      });
      throw error;
    }
  }

  normalizeMcpResult(rawResult) {
    if (rawResult && rawResult.isError) {
      return { title: 'Execution Error', status: 'error', summary: 'The integration returned an error.', cards: [], actions: [] };
    }
    const textPayload = rawResult?.content?.[0]?.text;
    if (textPayload) {
      try { 
        JSON.parse(textPayload); 
        return { title: 'Thinking...', status: 'complete', summary: 'Data retrieved successfully.', cards: [], actions: [] };
      } catch (e) {}
    }
    return { title: 'Thinking...', status: 'complete', summary: 'Action executed successfully.', cards: [], actions: [] };
  }
}
