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

## Outstanding acceptance gates

These remain open; batch 1 does not establish production readiness or a competition score.

| Gate | Required acceptance |
|---|---|
| M2 durable recipient discovery | Persist recipient-to-blob discovery; read it in preflight; recover across restarts and coordinate instances. |
| M2 exact-ID evidence | Establish supported authenticated download/decryption; verify exact payload hash against a trusted receipt; explicitly report incomplete/unavailable retrieval. An in-memory index or hashing arbitrary supplied JSON is insufficient. |
| M3 authenticated relationship | Bind owner submissions to an authenticated wallet session and a defined payer-recipient relationship. Self-selected identifiers and key control are not identity or supplier proof. |
| M3 durable publication transaction | Persist exact candidate, signed-consent binding, nonce lifecycle, stable idempotency, capacity reservation and accepted job before reporting progress. |
| M3 spending and concurrency | Atomically reserve per-wallet/global capacity; validate budgets; count unresolved jobs conservatively; test concurrent requests and multiple instances. |
| M3 recovery | Persist pending jobs and reconcile actual provider state after timeouts/restarts without reissuing duplicate writes. Ledger corruption fails closed; state is transactional and durably deployed. |
| M4 visible memory effect | A genuine consented confirmation changes a fresh-session comparison; differences and conflicting records stay review-required. |
| M5 user privacy and access | Scope records/receipts to their owner, minimize public PII, provide clear local-history controls and retention, and accurately explain immutable publication. |
| M5 browser acceptance | Verify desktop/mobile themes, keyboard navigation, wallet rejection, account switching, slow providers, empty/error states and receipt recovery. |
| M6 Mainnet proof | Capture genuine wallet signing, completed store, separate-session recall and Tatum observation with timestamps, blob/job IDs and honest verification limits. No invented incidents or artificial memory padding. |
| M6 submission | Verify distinct qualifying Mainnet memories against current rules; complete published blog, 2–3 minute demo and submission form; reconcile README and evidence ledger. |

## Validation boundary

Batch 1 adds real local signature verification, record-byte/hash binding, writer-reader compatibility, conflicting timeline, SDK return-shape, public-write lock and HTML safety regression checks. These are automated tests, not live network evidence. The prior main baseline passed 107 tests. The new suite must pass CI before main is advanced.

Public writes must stay disabled until all security, recovery, deployment and budget gates are satisfied. No Mainnet write was performed while preparing this batch.
