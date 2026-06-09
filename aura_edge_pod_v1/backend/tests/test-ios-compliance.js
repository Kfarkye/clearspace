import test from 'node:test';
import assert from 'node:assert/strict';
import { ComplianceGuard } from '../lib/compliance/compliance-guard.js';

test('iOS compliance plane', async (t) => {
  const guard = new ComplianceGuard();
  guard.policyCache = { policies: { webview_only_rejected: true } };

  await t.test('Allows non-iOS', async () => {
    const res = await guard.evaluate({ platform: 'web', webview_only: true });
    assert.equal(res.decision, 'ALLOW');
  });

  await t.test('Blocks webview-only on iOS', async () => {
    const res = await guard.evaluate({ platform: 'ios', webview_only: true });
    assert.equal(res.decision, 'BLOCK');
  });
});
