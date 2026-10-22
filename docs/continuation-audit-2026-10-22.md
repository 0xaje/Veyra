# Veyra continuation audit — 22 October 2026

## Verified repository snapshot

Inspected default branch tree at commit `657da6719306d43ceb78f6a0ce4a0209041e8c65`.

### Present in repository
- Deterministic full-address Sui recipient comparison: `src/core/recipient-check.ts`.
- Walrus memory write and recall scripts: `scripts/register-recipient.mjs`, `scripts/recipient-memory-check.mjs`.
- Locally recorded memory authorization and canonical record fingerprinting: `src/core/recipient-preflight.ts`.
- Read-only Tatum Sui JSON-RPC transaction evidence scripts: `scripts/tatum-sui-transaction.mjs` and `scripts/tatum-sui-live-evidence.mjs`.
- TypeScript tests under `tests/`.

### Not present
- No `apps/web` or `apps/api` implementation on the inspected branch.
- No deployed end-to-end preflight UI in the inspected tree.
- No cryptographically authenticated user approval flow.

## External blocker
Walrus Memory SDK `@mysten-incubation/memwal@0.1.9` recall returned HTTP 500 on Ubuntu/WSL and native Windows using the same account. Earlier memory write/read succeeded under an older account; current account's async write encountered embedding API 401. Do not treat unavailable memory as verified.

## Integration migration checkpoint
Sui Foundation documents GraphQL and gRPC as primary data-access interfaces; Sui Foundation JSON-RPC endpoints were disabled in 2026. Existing Veyra scripts call `sui_getTransactionBlock` through Tatum's JSON-RPC gateway. Verify current Tatum Sui gateway method support before relying on those scripts; do not claim they are broken solely because the Foundation retired JSON-RPC.

Tatum's v4 indexed transaction-history endpoint documentation does not list Sui among its currently supported chain values. Do not silently substitute `chain=sui-mainnet` without validating support. Prefer a documented Tatum Sui RPC gateway path that is actually supported and test it against a real transaction.

References:
- https://docs.sui.io/develop/accessing-data/data-serving
- https://docs.tatum.io/reference/gettransactionhistoryv4

## Next implementation gates

1. **Tatum proof gate:** capture one real Sui Mainnet transaction through a currently supported Tatum endpoint. Record endpoint host, method, digest, timestamp, observed fields, checkedAt, and limitations. Keep API keys out of logs.
2. **Decision safety gate:** distinguish observed transaction activity, historical recipient match, user-verified authorization, and actual recipient ownership. Never produce `safe` or automatic payment authorization from a matching address.
3. **Web UI gate:** implement a functional preflight flow with input validation, explicit review/mismatch states, evidence links, provider-unavailable states, and no hidden mock fallback.
4. **Walrus recovery gate:** preserve real SDK adapter; after upstream fix, verify write completion, durable blob ID, fresh-process recall, and binding to the exact authorized record.
5. **Submission gate:** reproduce all live claims with sanitized proof logs and independent commands; disclose blockers.

## Local environment caution
The user's WSL checkout may contain uncommitted `.gitignore`, `package.json`, `package-lock.json`, and an untracked live-result file. Do not force-reset or overwrite local files. Before pulling, run `git status --short` and reconcile local changes.

## Claims not yet independently verified
Tests were previously reported as passing, but this audit did not execute the local test suite. A repository code review alone does not verify deployed service availability or credentialed live calls.
