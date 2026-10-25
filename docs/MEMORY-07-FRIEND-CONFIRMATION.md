# Memory #7 — friend-confirmed Sui receiving address

## Current audit status — 25 October 2026

Stored record confirmed by fresh active inventory and hosted relayer recall: blob `fHD4G1o_hmpLohp1FasnNAZuCB27WpjGdfgsvU9SgQw`, job/index ID `ebac082b-8628-4bfb-802b-b824c591db9a`. The actual recalled source observation time is `2026-10-23T22:33:54.962Z`. This is the operator-relayed confirmation described below, not an independently authenticated recipient signature or public self-service submission. No new write was performed. Independent direct plaintext decryption remains unverified.

## Historical preparation instructions (superseded status)

The following text records the pre-write state, not current storage status.

**Status: AWAITING LOCAL PREPARATION AND EXPLICIT RECORD REVIEW — NOT STORED.**

## User-supplied evidence
- Friend's publicly shareable Sui Mainnet receiving address: `0x53059ac6228be6b4a5a67c3f72aa174b6f20363ee11d1bd301c6b3f7ef6bfe7f`.
- Operator reports that the friend directly confirmed this as their intended Sui receiving address and expressly permitted publication of the confirmation on Walrus Mainnet.
- The friend's original message and original confirmation timestamp were **not supplied**; this is an operator-relayed attestation, not independently verified wallet control.
- No transaction, payment authorization, wallet signature, or MemWal write has occurred for this record.

## Proposed event
- `type`: `veyra.recipient_evidence.v1`
- `chain`: `sui`; `network`: `mainnet`
- `counterpartyId`: `friend-1-sui-recipient` (pseudonymous label; avoid storing their name)
- `address`: `0x53059ac6228be6b4a5a67c3f72aa174b6f20363ee11d1bd301c6b3f7ef6bfe7f`
- `addressKind`: `wallet`
- `eventType`: `recipient_reconfirmed` (schema vocabulary; not a claim of previous history)
- `source.kind`: `direct_owner_confirmation` (operator-reported, not independently authenticated)
- `source.reference`: `Operator reports friend directly confirmed intended Sui receiving address and consented to public Walrus storage; original message not independently reviewed`
- `source.observedAt`: **fill with the real UTC time at which the operator actually reviewed the confirmation**. Do not invent a past time.
- `trust`: `informational_unverified`
- `independentlyVerified`: `false`; `paymentAuthorized`: `false`

## Procedure
1. Create a local JSON input with the fields above and a truthful `source.observedAt` timestamp. Never include the friend's name, private keys, screenshots, phone number or private messages in a public memory.
2. Run `node --experimental-strip-types scripts/prepare-evidence.mjs <local-input.json>` to validate and preview. This command does not write.
3. Review the exact public record and obtain separate approval before a **single** local-only `POST /v1/recipient-evidence` with `userApprovedStorage:true` and `confirmWrite:"STORE"`. Public Render writes remain disabled.
4. Record the actual completed MemWal job ID and blob ID, and perform a read-only semantic recall check. Do not count pending/failed jobs; do not retry a completed write.
5. Only after successful completion and verification mark memory #7 as stored. This is separate from a cryptographically signed wallet-control observation for memory #8.

**Do not claim identity, ownership, recipient safety, payment approval, or completed storage from this operator-relayed confirmation alone.**
