import fs from 'fs/promises';
import path from 'path';

export class ComplianceGuard {
  constructor() { this.policyCache = null; }
  async loadPolicy() {
    if (!this.policyCache) {
      const policyPath = path.resolve(process.cwd(), 'backend/contracts/platform/ios_compliance.json');
      try { this.policyCache = JSON.parse(await fs.readFile(policyPath, 'utf8')); } catch (err) { this.policyCache = { policies: {} }; }
    }
    return this.policyCache;
  }

  async evaluate(context) {
    const policy = await this.loadPolicy();

    if (context.platform === 'ios') {
      if (context.sideEffect === 'WRITE_HIGH_RISK') return { decision: 'REQUIRE_NATIVE_APPROVAL', reason: 'High-risk writes on iOS require native app approval.' };
      if (context.toolName === 'manage_email' && context.operation === 'send') return { decision: 'BLOCK', reason: 'Email sending blocked from current iOS profile.' };
      if (context.toolName === 'modify_database' && context.sideEffect !== 'READ_ONLY') return { decision: 'BLOCK', reason: 'Database modifications blocked from iOS.' };
    }

    if (context.platform !== 'ios') return { decision: 'ALLOW' };

    if (context.webview_only && policy.policies.webview_only_rejected) return { decision: 'BLOCK', reason: 'WebView-only mode is not submittable.' };
    if (context.payment_context && policy.policies.payments_blocked_pending_policy) return { decision: 'BLOCK', reason: 'Payments are blocked until payment policy is configured.' };
    if (context.notification_context?.requires_push && !context.notification_context.opted_in) return { decision: 'BLOCK', reason: 'Push notifications require opt-in.' };

    if (context.external_ai_used && context.workspace_scope_used) {
      const hasAiConsent = (context.user_consents_on_file || []).includes('external_ai_workspace_sharing');
      if (!hasAiConsent && policy.policies.ai_data_sharing_requires_consent) {
        return { decision: 'REQUIRE_CONSENT', missing_consents: ['external_ai_workspace_sharing'], reason: 'External AI use with workspace data requires explicit consent.' };
      }
    }
    if (context.workspace_scope_used && context.mutation_requested) {
      if (!context.has_native_approval && policy.policies.mutations_require_native_approval) {
        return { decision: 'REQUIRE_NATIVE_APPROVAL', reason: 'Workspace mutations require TrustGate plus native approval.' };
      }
    }
    return { decision: 'ALLOW' };
  }
}
