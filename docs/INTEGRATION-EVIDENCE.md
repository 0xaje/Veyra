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
| Tatum gRPC — live checkpoint | Developer-provided terminal output on 2026-10-22 21:27:13.283 UTC: `LedgerService/GetCheckpoint`, Sui Mainnet, sequence `336978294`, digest `HnBcLsSMidfgyLjXyudsSoexyZdPBvVXj1gbmLf4yAHb`, epoch `1288`. | The local script reported successful Tatum gRPC checkpoint retrieval. | Developer-supplied output; independently recheck provider availability before submission. |\n| Tatum gRPC — live transaction | Developer-provided terminal output on 2026-10-22 21:28:09.900 UTC: `LedgerService/GetTransaction`, digest `5BfxtP2UZbDMJAwm4bNjGvJuiP3fZW9QKghuwoYa7Nst`, discovery checkpoint `336978513`, sender `0x545b5ec1a8470d410bcb2ecaa700b5c0690a341943bcf5fcc708e3b0125fe817`, execution `success`, reported sender balance change `-101473` MIST of SUI. | The local script reported genuine historical transaction observation after inspecting 2 transactions. | This is **not** a recipient payment proof or evidence of the remembered wallet; the only reported balance change was on the sender. Reproduce via the preflight API and retain the redacted response. |

**Do not infer the number of qualifying Walrus memories from the number of recall search results.** Distinct genuine stored records, supported by unique blob IDs and relevant content, must be counted individually.

## Scoped Walrus memory inventory — 22 October 2026

Developer-provided output of `node --env-file=../Veyra/.env.local scripts/memwal-inventory.mjs` at `2026-10-22T21:36:12.874Z`:

| Metric | Observed |
| --- | --- |
| Namespace | `veyra-dev` |
| Recall status | `scoped_recall_completed` |
| Recipient search | 3 returned, 1 exact qualifying `veyra.recipient.v1` match |
| Smoke search | 3 returned, 1 exact smoke-statement match |
| Unique matching blob IDs | 2 |
| User-confirmed recipient-claim blobs | **1** — `MK8-ROPW1q5nusbhp16QennziZibSL8ZREDTPipd6EQ` (`my-sui-wallet`) |
| SDK integration-smoke blobs | **1** — `lN6o9uxHc9IXfT3i5bQ31fg2R9HT5Sz6nrqKtguR-Bw` |

**Scope and integrity:** This is a scoped semantic recall inventory, **not** an exhaustive list of all memories in the Walrus account. The smoke-test blob must not be counted as a genuine recipient claim. Neither the existence of a memory nor the confirmation metadata independently proves wallet ownership. Hackathon qualification/counting requirements remain unverified; do not claim a submission threshold has been met.

## Integrated preflight observation — 22 October 2026

Developer-supplied JSON response from `POST /v1/preflight` with counterparty `my-sui-wallet`, proposed address ending `b5e9`, and historical digest `5BfxtP2UZbDMJAwm4bNjGvJuiP3fZW9QKghuwoYa7Nst`:

| Field | Observed result |
| --- | --- |
| `status` | `read_only_preflight` |
| `providers.tatum` / `providers.walrus` | `observed` / `observed` |
| `recipient.verdict` | `review_required` |
| `recipient.memoryBlobId` | `MK8-ROPW1q5nusbhp16QennziZibSL8ZREDTPipd6EQ` |
| `memoryComparison.status` | `differs_from_remembered_claim` |
| Remembered address | `0x83874235f1db9761bcce93a11466a613a4516085da5ccfe121dddc3d63a0b5e8` |
| Proposed address | `0x83874235f1db9761bcce93a11466a613a4516085da5ccfe121dddc3d63a0b5e9` |
| `transactionInvestigation.sender` | `0x545b5ec1a8470d410bcb2ecaa700b5c0690a341943bcf5fcc708e3b0125fe817` |
| `balanceChanges[0].matchesProposedRecipient` | `false` |
| `action` | `manual_review_required` |
| `memoryComparison.independentlyVerified` | `false` |
| `paymentAuthorized` | `false` |
| `historyPersisted` | `true` |

**Interpretation:** This confirms the integrated read-only assessment path reported both providers observed and retained the correct fail-closed result. The observed transaction was unrelated to the proposed recipient; no onchain recipient ownership or malicious intent was established. This is developer-provided runtime output, not an independently audited trace. Preserve the original JSON separately if publishing as evidence.

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
- [x] Developer-provided redacted terminal output of live Tatum checkpoint and transaction retrieval, recorded above.\n- [x] Developer-provided integrated `/v1/preflight` JSON confirms both providers observed, address difference detected, unrelated historical transaction correctly distinguished, and `paymentAuthorized: false`.\n- [ ] Save the original timestamped API JSON in a redacted, reproducible submission evidence bundle.
- [ ] Walrus storage and separate-process recall outputs with genuine blob IDs, timestamps, and content classification.
- [ ] Screenshot or video of the exact-address match and changed-address warning, including the expandable technical evidence.
- [ ] Screenshot or response demonstrating that Veyra never signs or authorizes a transfer.
- [ ] Verified count of distinct, legitimate qualifying Walrus memories against the event's current rules; no artificial padding.
- [ ] Public repository link, working demo video, clear deployment/run instructions, and submission-form requirements checked against the official event page.

## Evidence handling

Keep private keys, API tokens, account identifiers, secrets, and local `.env.local` out of the repository and screenshots. Review historical transaction metadata and recipient labels before publication. Never claim that a remembered address is independently verified or that a provider-observed transaction proves current wallet ownership.
