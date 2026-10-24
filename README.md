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

**Verification:** On 24 October 2026, clean GitHub CI passed **125/125 tests** plus TypeScript and API syntax checks for the durable-publication batch. See [the verified run](https://github.com/0xaje/Veyra/actions/runs/40133118459). Automated tests use labelled local fixtures and real local signatures/HTTP/SQLite; they are not Mainnet evidence.

Fresh hosted read-only checks on 24 October recalled the friend's observation, showed an address-match result and a one-character-difference warning, and returned Tatum Sui Mainnet transaction data. Public writes remain disabled. The observed inventory listed nine records; qualifying Mainnet memory count, exact-ID payload verification, full browser/wallet publication acceptance and submission assets remain open.

The local self-service path now retains exact signed candidate bytes, reserves capacity transactionally, persists accepted jobs and receipts, and supports poll-only recovery. It requires an explicitly configured private SQLite path and genuine provider credentials. This does not enable public self-service. See [hardening status and acceptance gates](docs/PRODUCT-HARDENING.md).

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
