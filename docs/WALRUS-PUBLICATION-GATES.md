# Walrus publication — integrated M2/M3 work

Public writes remain locked. Private contacts continue to use the tested Render + Neon workflow. No Mainnet write or payment was performed by this change.

## What is implemented

- Publication preparations, quota reservations, job state, receipts and exact-read results share the existing Neon PostgreSQL connection/transaction driver. Local SQLite remains supported through the same asynchronous publication state machine. Existing local publication files are not silently moved to Neon.
- Hosted publication budgets initialize to **zero per wallet/day, zero globally/day, and zero for the lifetime of the service**. Quotas are checked atomically, including across processes. Unknown/pending jobs continue to consume capacity. The persisted budget must match each instance's configured policy; divergent instances fail closed. No environment variable or UI button opens public writes.
- Hosted preparation is authenticated, CSRF-protected and derived from an active payer-accepted receiving confirmation for the signed-in recipient wallet. A caller cannot choose an unrelated alias/address. The random nonce, exact record hash, canonical origin and private session binding prevent cross-session/origin replay. Raw signatures, session tokens, contact names and private verification codes are excluded from the proposed public record.
- The recipient may review this optional disclosure from their previous accepted receiving confirmations on `/receive-private`. Review does not sign, submit or store a Walrus record. The disabled publication action states that the release is locked.
- Deleting a private contact atomically removes its unsubmitted publication preparations. This does not erase existing public receipts, external exports, immutable content or provider recovery history.
- A durable per-counterparty receipt index supplies only exact-verified public records to the existing preflight interpretation. At most three indexed records are refreshed per assessment; the index is a bounded service window, not complete Walrus history. Semantic recall stays separately labelled and non-exhaustive. Record-hash verification is not identity proof or current wallet control.

## Exact download/decrypt path

`src/core/exact-walrus-record.ts` uses these supported public APIs:

1. Download the exact encrypted blob from the official Mainnet Walrus HTTP aggregator, with a response-size cap, timeout and redirect rejection.
2. Parse its SEAL envelope. Match the configured immutable Walrus Memory package and approved Mainnet committee profile. Unknown/legacy profiles fail closed; the implementation does not guess a policy or silently lower a threshold.
3. Read the configured MemWal account from Sui Mainnet and bind the ciphertext identity to that active account's owner.
4. Create a short-lived SEAL session using the service's already-authorized delegate key. Build the `account::seal_approve(id, registry, account)` transaction-kind bytes only. No transaction is submitted or executed.
5. Decrypt using the official SEAL SDK and authenticated Mainnet committee aggregator.
6. Hash the exact UTF-8 bytes against the completed durable publication receipt, then validate the receiving wallet, counterparty, record schema/network and conservative trust fields. No reserialization or caller-supplied plaintext substitutes for a network download.

Only a completed approved public receipt, or the already-public example blob recorded below, is admitted to this reader. There is no general arbitrary-blob public decrypt endpoint. Private receipt verification/status/discovery requires the authenticated receipt owner; preflight's public index contains stored public publication records only.

`verified` means the downloaded/decrypted record matches a trusted receipt hash. It does not mean the person is independently identified, the address is safe or payment is authorized. `read_unanchored` means actual download/decryption succeeded but no trusted historical receipt was supplied. `configuration_required`, `unsupported_ciphertext`, `unavailable` and `mismatch` never become a verified match.

## Genuine evidence and the external access requirement

On 2026-10-25 the existing publicly referenced friend blob was downloaded directly from:

`https://aggregator.walrus-mainnet.walrus.space/v1/blobs/fHD4G1o_hmpLohp1FasnNAZuCB27WpjGdfgsvU9SgQw`

Its actual encrypted envelope identifies:

- Immutable package: `0xe7c16fbea0560e7057e2bf7422feaa4fb313749fc69c9e9092fac7a33b81d7f5`.
- Mainnet committee: `0x686098f1439237fff9f36b99c7329683c22979d2005c2465cb891acb012a7595`.
- SDK profile: one committee with outer threshold 1 and weight 1. The committee's internal provider threshold is separate; this is not a threshold reduction.

The captured ciphertext fixture is a real downloaded public blob, not fabricated data. Replaying it in tests proves envelope parsing only. **No independent plaintext decryption or receipt anchoring is claimed for that historical blob.**

Sui's official SEAL provider documentation says this Mainnet committee requires an Enoki-issued API credential sent as `X-API-Key`. MemWal relayer recall has its own service access; it does not give Veyra the relayer's committee credential. The direct reader needs its own approved access.

The startup read-only probe checks this existing public blob only. `/health` reports `exactBlobReadiness`, with no secret or plaintext content. Missing `MEMWAL_SEAL_API_KEY` produces an explicit configuration-required result after inspecting the envelope. The authenticated private readiness action uses the same bounded/cached probe. Successful historical decryption would remain `read_unanchored`, because no trusted historical receipt was supplied.

### Account-owner action (zero-cost requirement)

1. Open `https://portal.enoki.mystenlabs.com` and request **SEAL Mainnet key-server access** through the dashboard's access form. This is different from Neon, Tatum and the MemWal delegate key.
2. State that this is Veyra for Tatum × Walrus Total Recall and that the budget is zero. Ask for non-billable hackathon/free access or credits. Do not upgrade, subscribe, deposit funds or accept a paid plan. Pricing/access approval must be confirmed by the provider; this code does not establish that access is free.
3. If a suitable credential is issued, enter it privately in **Render → Veyra → Environment** as `MEMWAL_SEAL_API_KEY`, then save/deploy. Do not paste it into chat, commit it or put it in frontend code.
4. Check `/health` → `exactBlobReadiness`. `read_unanchored` confirms a genuine historical exact read/decrypt, not public publication. `unavailable` reports a bounded stage category; it must not be reported as a successful read. No paid fallback or automatic new write exists.
5. If free access is unavailable, ask the organizers for a supported exact-ID read/decryption path covered by the existing hackathon service. Do not invent one or relabel semantic recall as exact retrieval.

## Remaining release work

- Obtain approved, non-billable Mainnet committee access and observe a genuine exact download/decrypt using the deployed service credentials.
- Finish the authenticated signed **submission** path and controlled admission policy. Preparation/review is implemented; the hosted submit action is intentionally not enabled. Recheck the recipient relationship and session at admission, independently verify the exact public consent signature, reserve capacity once, and send only the prepared bytes.
- Review actual storage allowance/spending controls, including an explicitly limited one-record canary policy. The zero budgets are not evidence of funded/free provider access and must not be increased casually.
- Complete a genuine recipient-signed canary publication and verify the exact resulting blob bytes against its receipt. Inspect timeout/retry recovery and restart persistence without duplicate submissions. No local lifecycle fixture qualifies as this evidence.
- Review any wider public rollout separately from this canary. Do not claim broad production readiness based on one successful record.

## Hosted private acceptance evidence

Operator-provided recordings/screenshots on 2026-10-25 show receiving confirmation, payer acceptance, a matching private address, a changed-character warning and a subsequent matching check. The operator reports restarting the Render service before the final matching check. That is user-run hosted acceptance evidence; the restart itself was not independently observed through Render administration. These are private contact tests, not Walrus publication or independent identity verification. Private wallet addresses/codes from those uploads are not reproduced in this repository.

## Validation and sources

CI uses real disposable PostgreSQL 17 databases plus local SQLite and generated local signing keys. Lifecycle/hash fixtures are clearly labelled as fixtures; no fake provider response is claimed as a live write/read. Tests cover cross-process reservations, daily and lifetime limits, session/origin binding, restart recovery, contact deletion, owner isolation, exact-byte mismatch and package-address rejection. The private journey remains covered on both databases.

Primary sources reviewed:

- `https://github.com/MystenLabs/walrus-memory/blob/dev/packages/sdk/src/manual.ts`
- `https://github.com/MystenLabs/walrus-memory/blob/dev/services/server/scripts/sidecar/seal-ptb.ts`
- `https://github.com/MystenLabs/walrus-memory/blob/dev/services/contract/sources/account.move`
- `https://github.com/MystenLabs/walrus-memory/blob/dev/apps/app/.env.example`
- `https://github.com/MystenLabs/walrus-memory/blob/dev/docs/api/memory-read-api.md` (metadata listing, not exact plaintext download)
- `https://www.docs.sui.io/sui-stack/seal/pricing`
- `https://www.docs.sui.io/sui-stack/seal/using-seal`
