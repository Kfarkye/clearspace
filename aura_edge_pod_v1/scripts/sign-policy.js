// Re-signs policy.json after you edit the policy body.
//
// The private key is NOT stored in this repo. Point AURA_POLICY_PRIVATE_KEY_PATH
// at the PEM file you saved out of band when the project was generated.
//
//   AURA_POLICY_PRIVATE_KEY_PATH=/secure/aura_policy_private.pem node scripts/sign-policy.js
//
// This reads policy.json, signs JSON.stringify(policy)+gitCommitHash, writes the
// signature back into policy.json, and verifies the result against the public key.

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

async function main() {
  const keyPath = process.env.AURA_POLICY_PRIVATE_KEY_PATH;
  if (!keyPath) {
    console.error('Set AURA_POLICY_PRIVATE_KEY_PATH to the private key PEM path.');
    process.exit(1);
  }

  const policyPath = path.resolve(process.cwd(), 'policy.json');
  const publicKeyPath = path.resolve(process.cwd(), 'policy_public_key.pem');

  const privateKeyPem = await fs.readFile(keyPath, 'utf8');
  const envelope = JSON.parse(await fs.readFile(policyPath, 'utf8'));
  const { policy, gitCommitHash } = envelope;

  const payload = JSON.stringify(policy) + gitCommitHash;
  const signer = crypto.createSign('SHA256');
  signer.update(payload);
  signer.end();
  const signature = signer.sign(privateKeyPem, 'base64');

  const publicKeyPem = await fs.readFile(publicKeyPath, 'utf8');
  const verifier = crypto.createVerify('SHA256');
  verifier.update(payload);
  verifier.end();
  if (!verifier.verify(publicKeyPem, signature, 'base64')) {
    console.error('Signature did not verify against policy_public_key.pem. Key mismatch.');
    process.exit(1);
  }

  envelope.signature = signature;
  await fs.writeFile(policyPath, JSON.stringify(envelope, null, 2) + '\n', 'utf8');
  console.log('policy.json re-signed and verified.');
}

main().catch(err => { console.error(err.message); process.exit(1); });
