# Integrated product hardening — 24 October 2026

This work follows INTEGRATED-PRODUCT-CONTRACT.md and preserves Veyra's recipient-safety purpose, genuine Tatum/Walrus adapters, original stored payloads and paymentAuthorized:false.

## Batch 1: M1/M3/M4/M5 corrections

- Preserve the exact prepared record bytes through consent signing and local submission. SHA-256 covers the complete stored JSON; it is recorded in consent and receipt, not embedded recursively in the payload.
- Classify new receiving confirmations as informational recipient self-reports, not independently verified relationships.
- Interpret historical signed-publication labels conservatively as stored claims; do not rewrite old blobs or treat their verification flags as fresh proof.
- Project unified recipient baselines into the assessment timeline. Repeated unverified blob IDs cannot hide conflicting addresses.
- Consume bounded, server-issued local preparations before provider calls. Unknown, altered, expired or consumed preparations fail closed. Restart invalidates pending preparations; this is NOT durable job recovery.
- Accept the installed MemWal waitForRememberJob completion result through the existing lifecycle classifier. A durable blob ID remains required.
- Public prepare/store routes remain unconditionally disabled regardless of environment flags. Public receipt enumeration is disabled. Local publication requests enforce same-origin checks and bounded request rates.
- Escape all dynamic memory-page HTML substitutions and move copy values out of inline JavaScript.
- Reflect deployment publication availability in the receiving UI. Inventory metadata is labelled as listed metadata, not verified active content.
- Add regression tests and CI with no provider credentials and no Mainnet writes. Fixtures are local test inputs only.

## Batch 2: durable local M3 pipeline

- Local self-service now requires an explicitly configured VEYRA_PUBLICATION_DB.
- SQLite transactions bind nonce consumption and capacity reservation. Every process on one host must use the same database file; independent files across hosts are not coordinated.
- Exact preparations and stable provider idempotency keys survive restart. Accepted provider job IDs are committed before pending responses.
- Publication returns pending separately from stored. The receiving UI can check an existing job without requesting another signature or write.
- Recovery polls only an already accepted provider job. If acceptance itself is uncertain, no automatic resubmission is permitted; capacity remains reserved for operator reconciliation.
- Unresolved prior-day jobs still consume capacity. Corrupt databases and invalid ceilings fail closed.
- An existing legacy JSON ledger blocks startup of the new local publication path until explicitly reconciled, preventing silent budget reset.
- Public writes, public job/receipt discovery and public preparation remain disabled.

These changes do not establish supported exact-ID decryption, authenticated payer relationships, cross-host coordination or deployment persistence.

## Outstanding acceptance gates

These remain open; batch 1 does not establish production readiness or a competition score.

| Gate | Required acceptance |
|---|---|
| M2 durable recipient discovery | Persist recipient-to-blob discovery; read it in preflight; recover across restarts and coordinate instances. |
| M2 exact-ID evidence | Establish supported authenticated download/decryption; verify exact payload hash against a trusted receipt; explicitly report incomplete/unavailable retrieval. An in-memory index or hashing arbitrary supplied JSON is insufficient. |
| M3 authenticated relationship | Bind owner submissions to an authenticated wallet session and a defined payer-recipient relationship. Self-selected identifiers and key control are not identity or supplier proof. |
| M3 durable publication transaction | SQLite local candidate/nonce/job/reservation persistence implemented; complete authenticated-session binding and Mainnet acceptance evidence. |
| M3 spending and concurrency | Atomic count reservations and unresolved-job accounting implemented for processes sharing one database; review actual spending budget and multi-host deployment coordination. |
| M3 recovery | Local pending jobs and poll-only recovery implemented. Live timeout/restart proof, operator reconciliation for unknown acceptance and persistent deployment remain required. |
| M4 visible memory effect | A genuine consented confirmation changes a fresh-session comparison; differences and conflicting records stay review-required. |
| M5 user privacy and access | Scope records/receipts to their owner, minimize public PII, provide clear local-history controls and retention, and accurately explain immutable publication. |
| M5 browser acceptance | Verify desktop/mobile themes, keyboard navigation, wallet rejection, account switching, slow providers, empty/error states and receipt recovery. |
| M6 Mainnet proof | Capture genuine wallet signing, completed store, separate-session recall and Tatum observation with timestamps, blob/job IDs and honest verification limits. No invented incidents or artificial memory padding. |
| M6 submission | Verify distinct qualifying Mainnet memories against current rules; complete published blog, 2–3 minute demo and submission form; reconcile README and evidence ledger. |

## Validation boundary

Batch 1 adds real local signature verification, record-byte/hash binding, writer-reader compatibility, conflicting timeline, SDK return-shape, public-write lock and HTML safety regression checks. These are automated tests, not live network evidence. Batch 1 passed 116/116 tests in clean GitHub CI before main advanced. Batch 2 adds real SQLite reopen, multi-connection and concurrent-process tests. Its suite must pass CI before main advances again.

Public writes must stay disabled until all security, recovery, deployment and budget gates are satisfied. No Mainnet write was performed while preparing this batch.

## Local durable-publication configuration

Use Node 24 and an explicitly chosen private local path:

```bash
VEYRA_PUBLICATION_DB="$PWD/.veyra-data/publication.sqlite" \
node --experimental-strip-types --env-file=/path/to/private/provider.env scripts/preflight-api.mjs
```

The operator must use the real existing provider environment and approved genuine recipient confirmations. Starting the service does not publish a memory. Configuring this path does not enable public writes. Do not deploy SQLite on ephemeral storage or point independent hosts at independent files and describe their budgets as globally shared.

Outstanding jobs are read using GET /v1/self-service/jobs?nonce=... in local mode. POST /v1/self-service/recover with the same nonce polls an accepted job only. Keep the database, its WAL/SHM files, and backups private and together. Unknown provider acceptance requires operator reconciliation; do not create another preparation as a workaround.
