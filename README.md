# Veyra

**Intelligence that remembers. Protection that evolves.**

Veyra is a **read-only Sui Mainnet recipient preflight application** for the Tatum × Walrus Total Recall hackathon. It helps people spot a proposed payment destination that differs from a previously remembered recipient claim. It does **not** sign transactions, establish identity, guarantee safety, or authorize payments.

## Working product

- Browser-based recipient assessment with a plain-language warning and next steps.
- Real Walrus Memory SDK integration for consented recipient registration and recall.
- Optional historical Sui Mainnet transaction investigation through Tatum gRPC.
- Exact-address comparison, conflicting-memory detection, and fail-closed manual-review outcomes.
- Session history, documentation, memory-claim timeline, and compact automatic day/night appearance.
- A consented recipient-update form that checks the previous Walrus claim before attempting storage; a newer claim never automatically supersedes an older address.
- Expandable technical evidence alongside the consumer-facing assessment.

**Verification:** On October 23, 2026 (Nigeria time), the developer ran `npm run check` successfully and reported **58 passing tests, 0 failures** after the merge into `main` (`a7cc04c`). These are local automated checks, not fresh hosted or live-provider verification. Live Tatum Sui Mainnet gRPC observations and genuine Walrus write/recall are recorded in [integration evidence](docs/INTEGRATION-EVIDENCE.md). One genuine recipient claim has been identified; the SDK smoke-test memory is not a recipient claim. No real recipient address-update write has been verified. Event memory-count qualification and final submission remain pending.

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
