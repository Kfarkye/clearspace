import fs from 'fs/promises';
import path from 'path';

async function auditIamContracts() {
  console.log('AURA IAM contract audit');
  console.log('-----------------------\n');

  try {
    const iamPath = path.resolve(process.cwd(), 'backend/contracts/iam/service-accounts.json');
    const envPath = path.resolve(process.cwd(), 'backend/contracts/env/edge-pod-env.json');
    const iamData = JSON.parse(await fs.readFile(iamPath, 'utf8'));
    const envData = JSON.parse(await fs.readFile(envPath, 'utf8'));

    let violations = 0;
    if (envData.models.router !== 'gemini-3.5-flash') { console.error('  [!] Router model must be gemini-3.5-flash'); violations++; } else { console.log('  [ok] Router model pinned to gemini-3.5-flash.'); }
    if (envData.models.tools !== 'gemini-3.1-pro') { console.error('  [!] Tool executor must be gemini-3.1-pro'); violations++; } else { console.log('  [ok] Executor model pinned to gemini-3.1-pro.'); }

    for (const fv of envData.forbidden) {
      if (process.env[fv]) { console.error(`  [!] Forbidden raw secret present in environment: ${fv}`); violations++; }
    }
    console.log('  [ok] No forbidden raw secrets present in environment.');

    const broker = iamData.serviceAccounts['aura-oauth-broker-sa'];
    if (!broker || !broker.permissions.includes('secretmanager.versions.access')) { console.error('  [!] aura-oauth-broker-sa missing secretmanager permission.'); violations++; } else { console.log('  [ok] OAuth broker holds Secret Manager access.'); }

    if (violations === 0) {
      console.log('\n[pass] IAM and routing contracts validated.');
      process.exit(0);
    } else {
      console.error(`\n[fail] Audit found ${violations} violation(s).`);
      process.exit(1);
    }
  } catch (error) { console.error('[error]', error.message); process.exit(1); }
}
auditIamContracts();
