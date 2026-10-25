# Veyra integrated product contract — approved direction (2026-10-24)

Status: APPROVED PRODUCT DIRECTION; engineering milestones are NOT claimed complete.

## Product promise
Before a Sui Mainnet transfer, Veyra helps a payer compare a proposed destination against consented, provenance-labelled recipient evidence. It can flag changes and uncertainty. It never authorizes or signs a payment, proves real-world identity, or guarantees safety.

## One end-to-end journey
1. Recipient connects their own Sui wallet and signs a purpose-bound, transaction-free message.
2. Recipient reviews the exact intended receiving address and the exact public fields, grants separate explicit publication consent, and submits to the secured Veyra service. Browser proof export is a temporary intermediate step, NOT the final public workflow.
3. Server independently verifies the signature, binds recipient confirmation to the same address and a clearly defined counterparty relationship, checks consent, freshness, replay/idempotency and per-user write limits. The signature alone cannot attest identity or supplier relationship. A checkbox is not a cryptographic signature of the recipient-intent statement.
4. Server writes only an approved non-secret evidence record using server-side MemWal credentials. The response distinguishes pending, stored and failed; only durable completed jobs count. The user receives job ID, blob ID, record hash and honest verification status.
5. The payer checks an address in the same app. The server retrieves relevant recipient records, informational evidence and wallet-control evidence without promoting one trust level to another.
6. The result explains matching, differing, conflicting, missing or incomplete evidence. It displays sources, timestamps, and relevant blob IDs. Every result requires independent human review and has paymentAuthorized:false.
7. Optional Tatum Sui Mainnet transaction lookup provides real historical chain observations, never wallet ownership or recipient approval.
8. User reviews their own assessment history with appropriate privacy and retention controls.

## Existing code to integrate, not replace
- src/core/recipient-preflight.ts and src/core/evidence-preflight.ts: conservative comparison and read-only result.
- src/core/recipient-evidence-event.ts: informational observations, including package references which must NEVER become payment recipients.
- src/core/portable-wallet-proof.ts and src/core/wallet-control-memory.ts: genuine key-control evidence, not identity.
- scripts/preflight-api.mjs: public reads and wallet proof; public Walrus writes currently forbidden.
- apps/web/index.html, verify-wallet.html, memory.html, history.html, docs.html: consolidate into one understandable workflow.
- Existing stored records retain original payloads and provenance; do not silently migrate or rewrite them.

## Architecture requirements before public writes
- Authenticated user identity/session and wallet-bound authorization for owner submissions; CSRF/origin protections and a replay-safe nonce challenge.
- A separate cryptographically bound consent statement for public publication, containing exact record hash, network, address, disclosure scope and expiration. Do not treat the current unsigned checkbox as this signature.
- Server-side validation of all submitted data, clear per-record provenance, and no secrets/raw wallet signatures in public Walrus records.
- Persistent idempotency and per-wallet quotas across restarts/instances; global rate limiting, abuse controls and spending caps. In-memory maps alone are insufficient.
- Asynchronous job status and durable receipt ledger; no duplicate writes on retries or timeout. Explicit failure and recovery semantics.
- An auditable retrieval path by exact blob ID with payload/hash verification, plus a discoverable per-recipient index. Semantic recall is non-exhaustive and MUST NOT be the sole basis for a complete-history or safe-match assertion.
- Consent withdrawal policy must acknowledge that public immutable content may not be retractable. Minimize public PII and avoid publishing relationship labels by default.
- Public API remains read-only until these gates are implemented, tested, and deployment credentials/budget controls reviewed.

## Evidence model
Use a unified interpretation layer over existing v1 record types rather than mutating stored records. Distinguish:
- claimed recipient relationship (self-report or independent contact),
- cryptographically verified wallet-key control (time-bounded),
- source-observed informational evidence,
- transaction observations from Tatum,
- operator-approved or user-approved publication provenance.
All outputs disclose retrieval completeness and uncertainty. No evidence type automatically authorizes payment.

## Milestone acceptance gates
M1: Unified evidence interpretation + integration tests for real existing formats, conflicts, wrong counterparties, stale signatures, missing sources, and package IDs.
M2: Reliable exact-ID retrieval and durable discovery/index, including degraded/unavailable provider states.
M3: Secured self-service confirmation + signed publication consent + real write/read receipt + abuse controls.
M4: End-to-end preflight using the unified model; visible memory-driven before/after change and conservative decision.
M5: Polished one-journey UX, privacy-safe history, documentation and accessible mobile interface.
M6: Real browser and wallet, Tatum, Walrus Mainnet end-to-end evidence, threat review, public deployment checks and hackathon submission assets.

No mock transaction, fabricated incident, invented storage receipt or fake provider response qualifies as live evidence. Tests can validate pure functions with fixtures, but such tests are never represented as live integrations.

## Original baseline limits (superseded by PRODUCT-HARDENING.md)

The bullets below record the starting checkpoint, not the current implementation. Subsequent code, CI results and remaining acceptance gates are tracked in [PRODUCT-HARDENING.md](PRODUCT-HARDENING.md).

### Starting checkpoint
- 91 local automated tests passed on 2026-10-24 (operator report), but the integrated journey has not passed live end-to-end testing.
- Seven operator-reported genuine MemWal stores with semantic recall, not direct raw-blob verification; organizer qualification not yet established.
- Public memory writes and durable public session history are disabled.
- Wallet-control proof export exists; self-service Walrus publication does not yet exist.

## Delivery discipline
Every code change must cite the milestone and user workflow it advances, preserve existing security boundaries, add appropriate tests, and be reviewed through the integrated application. No independent feature additions or real memory writes without explicit approval.

## Approved scope extension — unsigned assessment saving (25 October 2026)

The user explicitly requested that unsigned visitors can save their own checks and return to them without builder involvement. `veyra.assessment_memory.v1` records only a server-performed assessment, never recipient intent, ownership or approval. Use a persistent anonymous browser capability, exact server-authenticated record ticket, explicit record-bound consent, CSRF/origin protection, durable idempotency/quotas and owner-isolated receipts/retrieval. Recovery may transfer access through a private rotating bearer code. Never publish the bearer, private contact labels or private relationship records. Keep assessment snapshots separate from recipient baselines. Existing recipient-publication wallet signature requirements remain unchanged. Relayer-returned exact-blob/hash checks must be labelled as relayer verification; independent ciphertext decryption remains a separate claim. See SAVED-ASSESSMENTS.md for implementation and acceptance boundaries.
