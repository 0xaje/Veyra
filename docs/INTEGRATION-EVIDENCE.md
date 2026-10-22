# Veyra — integration evidence and verification ledger

This ledger distinguishes **recorded integration observations**, **automated local tests**, and **submission checks still pending**. It is not a claim that a new Mainnet transaction was sent or that a recipient is safe.

## Scope and safety boundary

Veyra is a read-only Sui Mainnet recipient preflight application. It compares the exact proposed destination against recalled Walrus recipient claims and can optionally inspect a historical transaction through Tatum gRPC. It does not sign, send, or authorize transfers. Recalled claims and provider observations do **not** prove wallet ownership or recipient identity. Payment authorization remains false.

## Integration evidence recorded during development

| Integration | Recorded evidence | What it establishes | Limitations |
| --- | --- | --- | --- |
| Walrus Memory SDK smoke test | `scripts/memwal-smoke.mjs`; proof ID `b6b1623b-392a-4e0a-9ff1-4b057f9b3030`; blob ID `lN6o9uxHc9IXfT3i5bQ31fg2R9HT5Sz6nrqKtguR-Bw` | A real SDK memory write was followed by an exact-content recall during development. | This is an integration test statement, **not** a verified recipient or transfer. Preserve raw terminal output separately. |
| Walrus cross-process persistence | `scripts/memwal-recall.mjs` recalled the smoke-test statement in a new process during development. | Persistence across processes was observed. | Rerun before submission and retain timestamped output. |
| Recipient memory registration | User-confirmed self-wallet record for counterparty `my-sui-wallet`, Sui Mainnet address `0x83874235f1db9761bcce93a11466a613a4516085da5ccfe121dddc3d63a0b5e8`; the UI returned a blob ID and later recalled the record. | A genuine consented memory write and subsequent comparison were observed. | Self-wallet confirmation is a user claim, not independent cryptographic proof. Capture the exact blob ID from the original result or fresh recall before publishing a submission proof. |
| Address-change comparison | The same counterparty was assessed with proposed address `0x83874235f1db9761bcce93a11466a613a4516085da5ccfe121dddc3d63a0b5e9` (last character changed). | UI reported a different remembered address, review required, and payment not authorized. | A controlled **read-only** test of comparison behavior; not evidence of a real attack or transfer. |
| Tatum gRPC | `src/core/evidence-preflight.ts` supports `LedgerService/GetTransaction` observations; `tests/evidence-preflight.test.ts` checks that historical participation never authorizes payment. | The code path and safety boundary are test-covered. | A current, reproducible live Tatum request with its digest, timestamp, and redacted response must be captured for the final evidence package. Test fixtures are not live network proof. |

**Do not infer the number of qualifying Walrus memories from the number of recall search results.** Distinct genuine stored records, supported by unique blob IDs and relevant content, must be counted individually.

## Current automated test checkpoint

On 22 October 2026, the developer ran `npm run check` and `npm test` at commit `2a8b711`: TypeScript check passed, **41 tests passed, 0 failed**. Subsequent UI-only commits require rerunning the same commands. Passing unit tests does not replace live network evidence.

## Reproducible local verification

Run from `~/Veyra-grpc` after pulling the current branch:

```bash
npm run check
npm test
```

Start the read-only API using the existing local environment file; never commit credentials:

```bash
VEYRA_HISTORY_FILE="$PWD/.veyra-data/assessments.jsonl" \
node --experimental-strip-types \
--env-file=../Veyra/.env.local \
scripts/preflight-api.mjs
```

Open `http://127.0.0.1:8787`. Use the already-registered `my-sui-wallet` counterparty and the one-character-changed proposed address above; leave transaction digest empty. Click **Run recipient assessment**. Do **not** submit the storage form, approve a new Walrus write, or transfer funds. Verify the visible consumer warning, expandable technical evidence, and `paymentAuthorized: false` response.

For cross-process recall of the existing smoke-test memory, with the appropriate private environment variables already loaded, run:

```bash
node scripts/memwal-recall.mjs b6b1623b-392a-4e0a-9ff1-4b057f9b3030
```

This script only reads; it does not create a new memory. Its output must show `cross_process_recall_verified` before it can be cited as a fresh verification.

## Evidence to capture for submission

- [ ] Current git commit, passing typecheck/test output, and timestamp.
- [ ] Redacted Tatum live gRPC request/response: network, real historical digest, provider method, timestamp, and observed participants; no credentials.
- [ ] Walrus storage and separate-process recall outputs with genuine blob IDs, timestamps, and content classification.
- [ ] Screenshot or video of the exact-address match and changed-address warning, including the expandable technical evidence.
- [ ] Screenshot or response demonstrating that Veyra never signs or authorizes a transfer.
- [ ] Verified count of distinct, legitimate qualifying Walrus memories against the event's current rules; no artificial padding.
- [ ] Public repository link, working demo video, clear deployment/run instructions, and submission-form requirements checked against the official event page.

## Evidence handling

Keep private keys, API tokens, account identifiers, secrets, and local `.env.local` out of the repository and screenshots. Review historical transaction metadata and recipient labels before publication. Never claim that a remembered address is independently verified or that a provider-observed transaction proves current wallet ownership.
