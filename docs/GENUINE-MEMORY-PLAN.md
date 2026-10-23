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

### Public-source observation — STORED, MEMWAL RECALL VERIFIED
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

## Actual MemWal write result — 2026-10-23 12:32:54 UTC

Operator-provided local HTTP response (not independently re-fetched):

- Endpoint: local `POST /v1/recipient-evidence`
- HTTP status: `200 OK`
- Record type: `veyra.recipient_evidence.v1`
- Counterparty: `deepbook-v3-package-reference`
- Address kind submitted: `package`
- Sui package ID: `0x337f4f4f6567fcd778d5454f27c16c70e2f274cc6377ea6249ddf491482ef497`
- MemWal status: `stored`
- Job ID: `7090634b-cd42-4ea3-8f55-f69c8d35c470`
- Blob ID: `r5lQKXv5DYWMV9oN-TuB0EA5v6GPGjyKyIdG9b8VSKk`
- `paymentAuthorized`: `false`
- MemWal recall of exact blob ID and expected content: **VERIFIED 2026-10-23 (operator-run read-only script)**; raw Walrus blob download: **NOT VERIFIED**
- Recipient wallet confirmation: **NO — package reference only**
- Official source: https://www.docs.sui.io/onchain-finance/deepbook/deepbookv3/contract-information

This is one reported successfully stored informational evidence event, separate from the existing confirmed recipient record. Do not count it as a verified recipient registration. Confirm blob contents and provenance via a real read before marking retrieval verified.

## MemWal recall verification result — 2026-10-23

Operator ran `scripts/verify-evidence-memory.mjs` locally with real MemWal credentials and reported `status: verified_via_memwal_recall`. Returned exact blob ID `r5lQKXv5DYWMV9oN-TuB0EA5v6GPGjyKyIdG9b8VSKk`, `counterpartyId: deepbook-v3-package-reference`, the expected package address, `addressKind: package`, `eventType: source_observed`, official-document source reference, `observedAt: 2026-10-23T12:32:25.459Z`, `trust: informational_unverified`, and `paymentAuthorized: false`. This establishes matching content through MemWal semantic recall, not an independently downloaded raw Walrus blob, owner authentication, or recipient-wallet safety. No additional write was performed by verification.

## Source-version discrepancy noticed 2026-10-23
The official DeepBook V3 contract-information page lists package `0x337f4f4f6567fcd778d5454f27c16c70e2f274cc6377ea6249ddf491482ef497` as version 6, but the official DeepBook V3 SDK documentation's embedded `mainnetPackageIds` currently lists `0x0e735f8c93a95722efd73521aca7a7652c0bb71ed1daf41b26dfd7d1ff71f748`. Both are official Sui documentation pages; do **not** claim the observed version-6 package is the uniquely current package without reconciling the discrepancy. The stored event remains an accurate timestamped observation of what the cited contract-information page states; no new write or update is implied. Source pages: https://www.docs.sui.io/onchain-finance/deepbook/deepbookv3/contract-information and https://www.docs.sui.io/onchain-finance/deepbook/deepbookv3-sdk/.


## Memory #3 — DeepBook Margin v3 observation (2026-10-23)

Operator reported a **single explicitly authorized** local write and then ran read-only MemWal recall verification:

- Counterparty: `deepbook-margin-v3-package-reference`
- Record type: `veyra.recipient_evidence.v1`
- Sui Mainnet address: `0xfbd322126f1452fd4c89aedbaeb9fd0c44df9b5cedbe70d76bf80dc086031377`
- Address kind: `package` — **not a wallet or payment recipient**
- Event: `source_observed`
- Source: `https://www.docs.sui.io/onchain-finance/deepbook/deepbook-margin/contract-information`
- Observation time: `2026-10-23T13:13:58.921Z`
- Local preparation: `prepared_not_stored` before the write
- Local POST result: HTTP 200, `state.status: stored`
- Job ID: `5b84254b-8887-4bc0-a2c7-2a9c33e9d5f0`
- Blob ID: `5nMwajzs04OUkI3VApxH1WmVLxZhtmmLKnkv7t0_Wgw`
- Read-only verification: `verified_via_memwal_recall` for exact blob ID, counterparty, address, event, source and timestamp (operator-provided output)
- Trust: `informational_unverified`; `paymentAuthorized: false`
- Limitation: **MemWal semantic recall only**, not a raw Walrus blob download, onchain ownership proof, or independently audited count

**Reported progress: 3 stored records toward the 10-memory target**, consisting of one recipient record and two distinct package-source observations. Whether each qualifies under the hackathon rules still needs to be checked. No write is performed by this documentation update.


## Memory #4 — user-confirmed Bybit SUI deposit observation (2026-10-23)

The operator reported one explicitly approved local write and a subsequent read-only MemWal recall verification:

- Counterparty: `my-bybit-sui-deposit`
- Record type: `veyra.recipient_evidence.v1`
- Sui Mainnet wallet-format address: `0xacb4bc177ab1a34482a587240afa12a393b306a040abb5930fa9b1217ffcc25c`
- Address kind: `wallet`
- Event: `recipient_reconfirmed` (schema label; **the Bybit account holder confirmed what was displayed, not a Bybit-controlled key signature or independent exchange attestation**)
- Source kind: `direct_owner_confirmation` (schema label; interpret narrowly as user-reported deposit-page confirmation, not Bybit wallet ownership proof)
- Source reference: `User confirmed address displayed in their own Bybit account under Deposit > SUI > Sui network`
- Observation time: `2026-10-23T13:38:58.396Z`
- Local preparation: `prepared_not_stored` before authorization
- Local POST result: HTTP 200, `state.status: stored`
- Job ID: `dc2c1e52-4226-4c87-84b8-e4fe13a0f93e`
- Blob ID: `f6iWcaX8qv71FSQgEVxm7nUSAYi3jcwGEeRZx-uLVrw`
- Read-only verification: `verified_via_memwal_recall` for exact blob ID, counterparty, address, event, source and observation time (operator-provided output)
- Trust: `informational_unverified`; `paymentAuthorized: false`
- Limitations: semantic MemWal recall, **not** raw Walrus blob download, wallet-key control proof, guarantee of exchange deposit validity, or payment authorization

**Reported progress: 4 stored records toward the 10-memory target** (one original recipient record, two package-source observations, one Bybit deposit-address evidence event). Eligibility of each record and independent raw Walrus availability remain unconfirmed. This documentation change performs no additional memory write.

## Live comparison demonstration (2026-10-23)

Operator-provided local HTTP outputs confirm that `GET /v1/evidence-timeline` with `counterpartyId=my-bybit-sui-deposit` and the previously observed wallet address returned `matches_recalled_observation`. Changing the proposed address's last character from `c` to `d` returned `differs_from_recalled_observation`. Both responses referenced stored blob `f6iWcaX8qv71FSQgEVxm7nUSAYi3jcwGEeRZx-uLVrw` and retained `action: manual_review_required`, `independentlyVerified: false`, and `paymentAuthorized: false`. Operator also supplied a screen recording of the local frontend showing matching and mismatching results. This is a controlled read-only comparison, not a fraud incident, independent exchange attestation, transfer, or new memory write. The deployed Render version has not been reverified after the UI commit. The reported memory count remains four; hackathon eligibility of those records remains unconfirmed.
