# Candidate memory #6 — OKX wallet-control verification (NOT STORED)

**Status:** proposed for operator review only. This document does not submit to MemWal or authorize storage. Current operator-reported count stays **5 / 10**.

## What was actually observed

On 2026-10-23, the operator supplied a screen recording of Veyra's deployed HTTPS wallet verification page showing **"VERIFIED: Wallet signing-key control demonstrated"** at **2026-10-23T18:22:11.845Z**. The operator also supplied a screenshot of the OKX Wallet personal-message signing prompt. The message contained the Veyra wallet-control purpose, Sui Mainnet, public wallet address, a nonce, and a five-minute expiry. The signing flow did not submit a Sui transaction and the page reported **"No Walrus memory was written."**

- Address: `0x83874235f1db9761bcce93a11466a613a4516085da5ccfe121dddc3d63a0b5e8`
- Wallet interface: OKX Wallet
- Counterparty label already in use: `my-sui-wallet`
- Evidence: operator-supplied recording and signing-prompt screenshot; these are **not** independently downloadable public attestations
- Claim supported: cryptographic signing-key control at the time of the backend verification, **not** real-world identity, recipient reputation, wallet safety, or authorization to pay

## Why not simply submit an existing evidence event?

The current `veyra.recipient_evidence.v1` schema has no `wallet_control_verified` event or cryptographic-proof provenance type. Mapping the result to `recipient_reconfirmed` / `direct_owner_confirmation` would lose the distinction between **user-reported confirmation** and **cryptographic proof**. Furthermore, the original successful API result was not preserved here as a cryptographically portable attestation; a screenshot alone is insufficient for independent re-verification.

**Do not claim an independently verified on-chain proof or store raw reusable signatures, secret keys, seed phrases, or wallet recovery material.**

## Proposed implementation before writing

1. Introduce a separate `veyra.wallet_control_observation.v1` schema, clearly describing an **application-verified, time-bound personal-message challenge** and its limitations.
2. Have the backend produce a narrowly scoped, non-secret verification receipt only after `verifyPersonalMessageSignature` succeeds. Include the verified public address, UTC verification time, chain, network, verification method, a unique non-replayable reference, and explicit `identityVerified:false`, `recipientSafe:false`, `paymentAuthorized:false`. Never include a private key or recovery phrase.
3. Present the exact proposed receipt to the user and obtain **separate explicit consent** before storing anything in MemWal. Do not automatically upload after signing.
4. Use local-only authorized write endpoints, require completed MemWal job with blob ID, and independently query read-only recall to confirm exact receipt and blob ID.
5. Add the resulting memory to the ledger **only after successful durable storage**. A new signature challenge may be required if no trustworthy original receipt is available.

## Operator approval needed

The user has authorized us to continue implementation and prepare evidence, **not** to automatically upload a specific wallet-control record with its public address and verification metadata to Walrus. Obtain approval of the exact payload before write.
