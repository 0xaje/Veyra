# Wallet-recipient evidence: next genuine-memory workflow

**Status:** design/provenance guidance only. No wallet signatures have been collected, no new memories written, and no wallet control independently verified by this document.

## Why this is the next priority

The existing Walrus ledger includes a user-confirmed recipient record and two informational package-document observations. A package ID is not a payment destination. Additional package observations may help demonstrate the evidence timeline but cannot demonstrate the core recipient-safety flow.

## Genuine wallet confirmation protocol

1. Ask a real counterparty to independently communicate their **Sui Mainnet wallet address** using a channel the operator already trusts. Do not copy an address from an explorer and infer the owner.
2. Record the actual method, time, and non-sensitive reference to the confirmation. Do not publish private messages, contact information, or signed messages without the counterparty's permission.
3. If the wallet supports `sui:signPersonalMessage`, a purpose-bound, time-limited, single-use challenge can provide stronger cryptographic evidence of **address control at the time of signing**. This must be verified using Sui-compatible signature verification and bound to the expected address. Connecting a wallet or seeing its address alone is not cryptographic proof of control. No signature verifier is implemented in Veyra yet.
4. Never request or store seed phrases, private keys, or wallet recovery information. Never request a transfer or transaction signature for this workflow.
5. Prepare a `veyra.recipient_evidence.v1` event with `addressKind: wallet`, `eventType: recipient_reconfirmed`, `source.kind: direct_owner_confirmation`, the real timestamp, and a truthful reference. The current event schema labels this `informational_unverified` and `paymentAuthorized:false`; do not misrepresent this as signature-verified.
6. Run `scripts/prepare-evidence.mjs` with the operator's actual JSON input. Inspect it before any write. Request a separate explicit approval for each MemWal write.
7. Only after approval, submit through the **local** write endpoint. Record completed job ID and blob ID; verify through read-only MemWal recall and note its limits. Public Render writes remain disabled.
8. If the operator does not have a genuine owner confirmation, **do not invent one**. A distinct official public source can be stored as `source_observed` instead, accurately labeled as an informational observation, subject to explicit approval.

## Design requirements for a future signature verification feature

- Use Sui Wallet Standard `sui:signPersonalMessage` (not transaction signing).
- Challenge must include app identity, Sui Mainnet, intended recipient address, explicit verification-only purpose, unpredictable single-use nonce, issuance and expiration.
- Verify signature and signer address against the exact challenge bytes; reject wrong addresses, expiry, reused nonce and unsupported schemes. Do not log secrets.
- Show user the precise address and context; even a valid signature proves only control at that moment, **not** recipient identity, reputation, or payment safety.
- Do not claim this feature is implemented until real end-to-end tests pass.

References:
- https://www.docs.sui.io/onchain-finance/asset-custody/wallets/wallet-standard
- https://www.docs.sui.io/develop/transactions/transaction-auth/intent-signing

## Evidence inventory (operator-reported)

- `my-sui-wallet`: recipient record; blob `MK8-ROPW1q5nusbhp16QennziZibSL8ZREDTPipd6EQ`.
- `deepbook-v3-package-reference`: informational package observation; blob `r5lQKXv5DYWMV9oN-TuB0EA5v6GPGjyKyIdG9b8VSKk`.
- `deepbook-margin-v3-package-reference`: informational package observation; blob `5nMwajzs04OUkI3VApxH1WmVLxZhtmmLKnkv7t0_Wgw`.

**Total: three reported stored records, not three recipient wallets.** The hackathon eligibility of each record and the independent raw Walrus blob status remain unconfirmed.


## Live deployed OKX verification milestone — 2026-10-23

Operator-supplied 10-second screen recording of `https://veyra-rs1l.onrender.com/verify-wallet` shows the final API-backed result: `VERIFIED: Wallet signing-key control demonstrated at 2026-10-23T18:22:11.845Z`. The challenge displayed Sui Mainnet address `0x83874235f1db9761bcce93a11466a613a4516085da5ccfe121dddc3d63a0b5e8`, a purpose-bound nonce, and a five-minute expiry. The operator used OKX Wallet and supplied a separate screenshot of the wallet's personal-message signing request. This is evidence of successful live signature verification, not a Sui transaction, payment authorization, real-world identity verification, or recipient safety. The recorded UI explicitly says `No Walrus memory was written`.

This observation is documented here only. It does **not** create a sixth Walrus memory, change the original recipient record's trust classification, or publish a reusable signature. A separate truthful evidence record, explicit user storage consent, completed MemWal job with blob ID, and read-only recall verification are required before any new memory is counted. The operator-reported inventory in `GENUINE-MEMORY-PLAN.md` remains **five** stored records.

The earlier sections above describe the feature before it was implemented and should be read as historical planning, not the current implementation state.
