import test from 'node:test';
import assert from 'node:assert/strict';
import { McpClientRegistry } from '../backend/lib/orchestrator/McpClientRegistry.js';
import { ComplianceGuard } from '../backend/lib/compliance/compliance-guard.js';
import { AuraMcpOrchestrator } from '../backend/lib/orchestrator/AuraMcpOrchestrator.js';

test('AURA production safeguards', async (t) => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  await t.test('MCP client blocks when endpoint missing in production', async () => {
    const registry = new McpClientRegistry();
    await registry.connectAll([{ server_id: 'test_mcp', name: 'Test MCP', endpoint_url: null }]);
    const client = registry.get('test_mcp');
    try {
      await client.callTool({ name: 'test_method', arguments: {} });
      assert.fail('Should have thrown UNAVAILABLE');
    } catch (err) { assert.match(err.message, /UNAVAILABLE/); }
  });

  await t.test('MCP client attempts real fetch when endpoint provided', async () => {
    const registry = new McpClientRegistry();
    await registry.connectAll([{ server_id: 'test_mcp_real', name: 'Test MCP Real', endpoint_url: 'http://invalid.local', timeout_ms: 2000 }]);
    const client = registry.get('test_mcp_real');
    try {
      await client.callTool({ name: 'test_method', arguments: {} });
      assert.fail('Should have thrown a fetch error');
    } catch (err) { assert.match(err.message, /fetch failed|Upstream MCP fetch failed|ECONNREFUSED|ENOTFOUND|UNAVAILABLE/i); }
  });

  await t.test('Compliance ignores unledgered client consent claims', async () => {
    const guard = new ComplianceGuard();
    guard.policyCache = { policies: { ai_data_sharing_requires_consent: true } };
    const ctx = { platform: 'ios', external_ai_used: true, workspace_scope_used: true, user_consents_on_file: [] };
    const res = await guard.evaluate(ctx);
    assert.equal(res.decision, 'REQUIRE_CONSENT');
  });

  await t.test('Orchestrator enforces compliance before TrustGate or execution', async () => {
    const mockCompliance = { evaluate: async () => ({ decision: 'BLOCK', reason: 'Blocked by test.' }) };
    // Construct with the full 7-arg signature: registry, clientRegistry, trustGate,
    // compliance, accountLedger, traces, gitOps.
    const orchestrator = new AuraMcpOrchestrator(
      { resolve: () => ({ resolvedOperation: {} }) }, {}, {}, mockCompliance, {}, { write: async () => {} }, {}
    );
    try {
      await orchestrator.executeGovernedTool({ userId: 'u1', platform: 'ios', isAuthorized: true }, { operation: 'test' });
      assert.fail('Should have blocked execution');
    } catch (err) {
      assert.match(err.message, /COMPLIANCE_VIOLATION/);
    }
  });

  process.env.NODE_ENV = originalEnv;
});
