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
- Local durable publication with separate pending/completed states; public publication is disabled.
- Expandable technical evidence alongside the consumer-facing assessment.

**Verification (25 October 2026):** Current product code at `ca51769` passed **179/179 tests** in GitHub CI, including real disposable PostgreSQL 17 and SQLite journeys, plus TypeScript and syntax checks. Hosted read-only acceptance passed all six checks. A fresh local audit passed 155/155 tests (without PostgreSQL). Automated fixtures are not Mainnet write evidence.

Hosted Render + Neon private contacts are enabled. A payer creates a private invitation, the recipient signs a relationship-bound receiving statement, and the payer independently checks the full address and code before accepting. Accepted contacts feed the address-check form. Labels stay private; this journey does not publish to Walrus. Revocation invalidates unsubmitted publication preparations and remains effective after restart.

Fresh inventory lists **nine unique active Mainnet memory blobs** in the configured namespace. The audit freshly recovered seven product records through hosted relayer reads; two SDK integration-check memories have historical write/recall evidence and fresh inventory metadata. This does not establish ten qualifying memories or independent ciphertext decryption. See [the closeout audit](docs/CLOSEOUT-AUDIT-2026-10-25.md).

Public Walrus publication remains disabled. Local signed-consent, quota and job-lifecycle components exist, and hosted authenticated disclosure preparation/review is implemented, but the hosted signed submission route is not connected. Independent exact decryption also lacks approved Mainnet committee access. Existing Mainnet relayer recall and private contacts continue working. No paid service or new Mainnet write was used for this audit.

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

Keep Render Free and use Neon Free PostgreSQL for the existing wallet-authenticated private recipient workflow. Follow [the Neon setup guide](docs/NEON-SETUP.md). Configure the server-only `DATABASE_URL`; do not configure a local SQLite path alongside it. Hosted activation remains explicit and requires the storage/origin review. The same relationship state machine runs on PostgreSQL and local SQLite. CI runs its private journey against real PostgreSQL 17 as well as SQLite; no fabricated Mainnet writes are used. This integration does not enable public Walrus publication. The durable publication ledger now shares Neon, with hosted write budgets held at zero as described below.

### Walrus publication progress

[Publication gates and the Mainnet SEAL access requirement](docs/WALRUS-PUBLICATION-GATES.md) track the current M2/M3 work. Neon now holds durable publication preparations/jobs/quotas/receipts as well as private contacts. Hosted write budgets stay at zero and the public submit routes remain locked. The exact-reader uses supported Walrus/SEAL APIs; direct Mainnet committee access still needs an approved server-only credential. No genuine public write/read success is claimed by the lifecycle tests.
