# Veyra

**Intelligence that remembers. Protection that evolves.**

Veyra is a **read-only Sui Mainnet recipient preflight application** for the Tatum × Walrus Total Recall hackathon. It helps people spot a proposed payment destination that differs from a previously remembered recipient claim. It does **not** sign transactions, establish identity, guarantee safety, or authorize payments.

## Working product

- Browser-based recipient assessment with a plain-language warning and next steps.
- Real Walrus Memory SDK integration for consented recipient registration and recall.
- Optional historical Sui Mainnet transaction investigation through Tatum gRPC.
- Exact-address comparison, conflicting-memory detection, and fail-closed manual-review outcomes.
- Session history, documentation, memory-claim timeline, and compact automatic day/night appearance.
- Conservative recipient-update validation; a newer claim never automatically supersedes an older address.
- Self-service assessment saving with durable pending/completed receipts and returning-browser history; signed recipient-confirmation publication remains separately disabled.
- Expandable technical evidence alongside the consumer-facing assessment.

**Verification (25 October 2026):** Self-service assessment saving at `9a6fc0c` passed **191/191 tests** in GitHub CI, including real disposable PostgreSQL 17 and SQLite journeys, plus TypeScript and syntax checks. Hosted read-only acceptance passed all six checks. A fresh local check passed 161/161 tests (without PostgreSQL). Automated fixtures are not Mainnet write evidence.

Hosted Render + Neon private contacts are enabled. A payer creates a private invitation, the recipient signs a relationship-bound receiving statement, and the payer independently checks the full address and code before accepting. Accepted contacts feed the address-check form. Labels stay private; this journey does not publish to Walrus. Revocation invalidates unsubmitted publication preparations and remains effective after restart.

Fresh inventory now lists **ten unique active Mainnet memory blobs** in the configured namespace. The existing nine-record audit is followed by one genuine consented self-service assessment save, completed receipt, matching-hash relayer recall and new-tab history return. Two of the historical records are SDK integration checks, not recipient confirmations. See [live saved-assessment acceptance](docs/evidence/2026-10-25-saved-assessment-acceptance.json) and [the updated inventory](docs/evidence/2026-10-25-inventory-after-save.json). These results do not claim independent ciphertext decryption or an organizer eligibility ruling.

**Self-service assessment saving is implemented:** check an address, review the exact record, consent, save to Walrus and return to Activity History without wallet sign-in. A secure browser credential and durable Neon index retain access, with a rotating recovery code for another browser. Records retain a genuine completed job/blob receipt; a separate recall action checks exact returned bytes/hash through the MemWal relayer. See [saved assessment workflow and acceptance](docs/SAVED-ASSESSMENTS.md).

Signed recipient-confirmation publication remains separately disabled; saving an assessment is never proof of recipient approval or ownership. Independent exact ciphertext decryption lacks approved Mainnet committee access and is not claimed by relayer verification. No paid service is required by the saved assessment implementation.

See [private workflow and security boundaries](docs/PRIVATE-RECIPIENT-RELATIONSHIPS.md) and [publication gates](docs/WALRUS-PUBLICATION-GATES.md).

## Quick start

Requires Node.js 24 and a locally configured environment file with legitimate provider credentials. Do not commit credentials.

```bash
npm install
npm run check
npm test
```

Run the local API and web UI from the repository root, adapting the environment-file path to your machine:

```bash
VEYRA_HISTORY_FILE="$PWD/.veyra-data/assessments.jsonl" \
node --experimental-strip-types \
--env-file=../Veyra/.env.local \
scripts/preflight-api.mjs
```

Open `http://127.0.0.1:8787`.

A recipient assessment is read-only. **Storing a recipient on Walrus is a separate, real write requiring explicit approval**; do not use the registration form for sample data or unverified recipient information.

## How it works

1. Enter a recipient identifier and proposed Sui Mainnet address.
2. Veyra recalls relevant Walrus recipient claims and compares complete normalized addresses.
3. Optionally supply a **real historical transaction digest** for a Tatum provider observation.
4. Review the plain-language outcome, recommended actions, and expandable evidence.
5. Independently confirm the recipient before any payment. Veyra never authorizes a transfer.

Walrus memory is not an identity oracle. Historical onchain participation does not prove current ownership. Missing or conflicting data never becomes a safety guarantee.

## Evidence and architecture

- [Integration evidence and outstanding submission checks](docs/INTEGRATION-EVIDENCE.md)
- `src/core/evidence-preflight.ts` — provider observations and informational memory comparison.
- `src/core/recipient-preflight.ts` — exact record authorization and recipient verdicts.
- `src/core/recipient-memory-timeline.ts` — read-only history and conflicting-address interpretation.
- `src/core/recipient-update.ts` — fail-closed validation of recipient updates before writer initialization.
- `scripts/preflight-api.mjs` — read-only assessment and explicit Walrus write endpoints.
- `scripts/memwal-smoke.mjs` — genuine SDK write-and-recall smoke test; **creates a real memory**.
- `scripts/memwal-recall.mjs` — read-only cross-process recall of an existing smoke-test record.
- `apps/web/` — consumer UI, history, memory, and documentation.

## Product integrity

No invented onchain transactions, mocked provider success, fabricated stored memories, or private keys in public blobs. Evidence sources and limitations are shown explicitly. All payment decisions remain with the user after independent verification.

### Free private-contact hosting with Neon

Keep Render Free and use Neon Free PostgreSQL for the existing wallet-authenticated private recipient workflow. Follow [the Neon setup guide](docs/NEON-SETUP.md). Configure the server-only `DATABASE_URL`; do not configure a local SQLite path alongside it. Hosted activation remains explicit and requires the storage/origin review. The same relationship state machine runs on PostgreSQL and local SQLite. CI runs its private journey against real PostgreSQL 17 as well as SQLite; no fabricated Mainnet writes are used. This integration does not enable public Walrus publication. The recipient-publication ledger shares Neon with zero recipient-publication budgets; saved assessments use a separate, bounded consent/admission policy described in SAVED-ASSESSMENTS.md.

### Walrus publication progress

[Publication gates and the Mainnet SEAL access requirement](docs/WALRUS-PUBLICATION-GATES.md) track the current M2/M3 work. Neon now holds durable publication preparations/jobs/quotas/receipts as well as private contacts. Recipient-publication budgets stay at zero and those submit routes remain locked. Assessment saving has its own authenticated browser consent and bounded write policy; it does not open recipient-publication routes. The exact-reader uses supported Walrus/SEAL APIs; direct Mainnet committee access still needs an approved server-only credential. No genuine public write/read success is claimed by the lifecycle tests.
