# Genuine Walrus memory collection — evidence-first protocol

The Total Recall rules require at least 10 real Walrus Mainnet memories. This is a **write count**, not a requirement for 10 distinct wallets. Do not assert qualification until actual successful Mainnet jobs, durable blob IDs and an independently inspectable count are available.

## Current evidence
- One verified recipient record: `my-sui-wallet`, blob `MK8-ROPW1q5nusbhp16QennziZibSL8ZREDTPipd6EQ`.
- One prior SDK smoke-test blob exists but is not a recipient record; assess its eligibility separately and disclose its actual purpose.
- Hosted Render read-only preflight has observed both Walrus recall and Tatum gRPC. Public writes remain disabled.

## Event model under development
`src/core/recipient-evidence-event.ts` validates proposed informational events without writing anything. It does not change the existing recipient claim format, recall filter, public API, or deployed interface.

Allowed evidence categories:
- `source_observed`: an actual, timestamped official public address statement. Record its exact URL and what it claims; do not call it proof of current control.
- `recipient_reconfirmed`: a genuine, independently obtained fresh confirmation by the owner, with an actual reference.
- `mismatch_reviewed`: a real completed Veyra assessment and its actual assessment reference; do not invent an incident.

Every event is marked `informational_unverified`, `independentlyVerified:false`, and `paymentAuthorized:false`. An address from a block explorer or rich list must never be silently attributed to a person.

## Before enabling any writes
1. Decide which real event sources are available and review whether their public disclosure is appropriate.
2. Implement an authenticated, local-only MemWal writer with explicit consent and completed-job blob-ID verification; public Render writes must stay HTTP 403.
3. Implement a read-only event recall/timeline that does not mix informational observations with owner-confirmed recipient records.
4. Add tests for source provenance, consent, failure handling, and trust boundaries.
5. Run local `npm run check && npm test`; perform genuine SDK writes only with explicit user approval and live provider readiness.
6. Verify each stored blob ID and maintain a dated evidence ledger; do not count accepted/pending/failed jobs as completed writes.
7. Independently confirm the total Mainnet memory count against the official submission requirement.

No real additional memory writes have been made by this change.

## Address-kind safety (2026-10-23)
Every new evidence event must explicitly specify `addressKind`: `wallet`, `package`, or `shared_object`. Package/object observations are **not payment recipients** and must never be presented as a safe transfer destination. Only wallet identifiers can be associated with recipient reconfirmation or mismatch review. This is enforced by the validator and tests; it is not a cryptographic onchain type check.

### Candidate public-source observation — NOT YET WRITTEN
- `counterpartyId`: `deepbook-v3-package-reference`
- `addressKind`: `package`
- `eventType`: `source_observed`
- `source.kind`: `public_official_document`
- `address`: `0x337f4f4f6567fcd778d5454f27c16c70e2f274cc6377ea6249ddf491482ef497`
- `source.reference`: `https://www.docs.sui.io/onchain-finance/deepbook/deepbookv3/contract-information`
- Official documentation identifies this as DeepBook V3's Mainnet v6 package, not a wallet. Because published package IDs can change with upgrades, preserve the exact observed document and timestamp.
- **Do not send tokens to this address.** A package observation is only a source-backed reference, not evidence of recipient control.
- The observation time must be the real time the operator checks the source; it must not be fabricated or future-dated. Never submit this record without explicit approval.
- This record must not be counted as stored until a real Walrus Mainnet job returns a durable blob ID and that blob can be verified.

### Production boundary
The public API remains write-disabled. The local `/v1/recipient-evidence` endpoint validates `addressKind` before attempting any real write. Existing `veyra.recipient.v1` recall remains separate and cannot automatically trust informational evidence events.
