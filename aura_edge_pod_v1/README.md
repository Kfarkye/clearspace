# AURA Edge Pod V1

A zero-trust control plane scaffold. Compliance evaluation runs before TrustGate
locking and before tool execution; worker invocation uses OIDC; user OAuth
tokens are brokered through Secret Manager.

## Status of each piece

- **GitOps policy signing**: real. A P-256 keypair was generated at build time.
  `policy.json` carries a valid signature over `JSON.stringify(policy)+gitCommitHash`,
  verified on boot in all environments. The private key is NOT in this repo.
- **MCP client transport**: real HTTP JSON-RPC with per-contract timeout.
- **OAuth token broker**: real refresh-token grant against Google's token
  endpoint, but written without a live project to test against. NEEDS
  INTEGRATION TESTING before relied upon.
- **Media resolution**: NOT IMPLEMENTED. Returns a structured 501; no fake video.

## Lock lifecycle

`PENDING -> APPROVED | REJECTED | EXPIRED`, `APPROVED -> EXECUTING | EXPIRED | DISCARDED`,
`EXECUTING -> EXECUTED | FAILED`. The service writes `PENDING` on creation and the
policy defines the allowed transitions out of it.

## Re-signing the policy

If you edit the policy body in `policy.json`, the boot verifier will reject it
until you re-sign:

```
AURA_POLICY_PRIVATE_KEY_PATH=/secure/aura_policy_private.pem npm run sign:policy
```

## Quick start

```
npm install
npm run audit:iam   # validate IAM and routing contracts
npm test            # compliance, boundary, and lane tests
npm start           # boot the Edge Pod
```
