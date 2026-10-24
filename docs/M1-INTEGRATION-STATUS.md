# M1 integration progress — 24 October 2026

Advances steps 5–6 and 8 of INTEGRATED-PRODUCT-CONTRACT.md. Option A remains the approved direction; this change does not enable publication.

## Resolved comparison inconsistency

Previously a `veyra.recipient_evidence.v1` reconfirmation could yield `conclusion.status: matches_observed_address` while `memoryComparison.status: not_found`. Both now derive from the same validated recipient baseline. The compatibility comparison keeps its existing status vocabulary and adds its interpretation basis, source blob IDs and unknown retrieval completeness.

An observation is never converted into a legacy authorized recipient record. `recipient` explicitly describes the legacy exact-record authorization check, and remains `review_required` for observation-only results. A cross-format conflict overrides a legacy authorized match with review required. The original Walrus payloads are not rewritten.

## Integrated evidence path

The real MemWal adapter now searches for wallet-control records for the proposed address alongside recipient evidence. It reports each search independently, accepts informational package/shared-object context without using it as a receiving-address baseline, and feeds all record types into the existing preflight interpreter. The UI uses the unified comparison and shows source reference, timestamp, provenance, blob ID and freshness using textContent. Local assessment history records the unified conclusion and evidence references; public history remains disabled.

Recalled wallet-control verification strings are claims, not a freshly verified signature. `controlProven` is false; signed time windows are labelled expired or unexpired claims, and neither proves current control, recipient intent, identity or payment authorization. Missing/future sources and malformed legacy claims cannot establish a baseline. Repeated unverified blob identifiers cannot conceal conflicting addresses.

## Validation

- Repository baseline reproduced: 96/96 automated tests passed (the supplied continuation prompt reported 94/94).
- Updated suite: 104/104 passed; `npm run check` and `git diff --check` passed.
- Tests use explicit function fixtures for record-format interpretation and actual localhost HTTP servers for unavailable-provider/security behavior. They are not live Mainnet evidence.
- Chromium could not be installed: the downloaded archive was empty/invalid. Browser layout and interaction verification remain outstanding.
- No Tatum/MemWal credentials or Sui protobuf directory are configured in this workspace. The friend's observation has not been recalled again from Mainnet here. No new memory write, payment or deployment was performed.

## M2 investigation and remaining gates

The installed `@mysten-incubation/memwal` SDK provides `recall()` for semantic plaintext retrieval and `listMemories()` for metadata only. It does not expose a public exact-ID plaintext read method. Raw Walrus bytes can be SEAL-encrypted, so downloading a blob must not be represented as verifying its plaintext record. A supported authenticated exact-ID download/decryption path and byte/hash receipt definition must be established before claiming M2 completion. No private SDK method or invented relayer endpoint is used.

The API now explicitly reports semantic retrieval, unknown completeness, unavailable/degraded provider states, and `exactIdVerification: not_performed`. This disclosure advances the integrated M2 boundary; it does not satisfy the durable index or exact-ID acceptance gates.

M1 automated acceptance coverage is expanded; live integrated acceptance is still pending. M2–M6 remain incomplete, including durable per-recipient discovery, secured sessions, signed publication consent, persistent quotas/idempotency and receipt ledger, spending controls, wallet/browser Mainnet evidence and deployment review. Public memory writes remain disabled until the contract's security gates are satisfied.
