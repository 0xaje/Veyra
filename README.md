# Veyra

**Intelligence that remembers. Protection that evolves.**

Veyra is a **read-only Sui Mainnet recipient preflight application** for the Tatum × Walrus Total Recall hackathon. It helps people spot a proposed payment destination that differs from a previously remembered recipient claim. It does **not** sign transactions, establish identity, guarantee safety, or authorize payments.

## Working product

- Browser-based recipient assessment with a plain-language warning and next steps.
- Real Walrus Memory SDK integration for consented recipient registration and recall.
- Optional historical Sui Mainnet transaction investigation through Tatum gRPC.
- Exact-address comparison, conflicting-memory detection, and fail-closed manual-review outcomes.
- Session history, documentation, and compact automatic day/night appearance.
- Expandable technical evidence alongside the consumer-facing assessment.

**Verification:** At commit `2a8b711`, the developer ran `npm run check` successfully and reported **41 passing tests, 0 failures**. UI refinements after that commit still need a fresh local run and browser review. Genuine Walrus memory storage and recall and a changed-address assessment were observed during development. The final live Tatum evidence bundle and qualification against event submission rules are still pending.

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
- `scripts/preflight-api.mjs` — read-only assessment and explicit Walrus write endpoints.
- `scripts/memwal-smoke.mjs` — genuine SDK write-and-recall smoke test; **creates a real memory**.
- `scripts/memwal-recall.mjs` — read-only cross-process recall of an existing smoke-test record.
- `apps/web/` — consumer UI, history, memory, and documentation.

## Product integrity

No invented onchain transactions, mocked provider success, fabricated stored memories, or private keys in public blobs. Evidence sources and limitations are shown explicitly. All payment decisions remain with the user after independent verification.
