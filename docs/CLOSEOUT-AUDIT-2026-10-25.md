# Veyra closeout audit — 25 October 2026

Scope: inspect product commit `ca51769dcdb024b0240118fad646dafac32ea7a0`, genuine deployed read-only inventory/recall, existing evidence, and local automated revalidation. No provider write, payment, paid service, new recipient or impersonated wallet was used. Findings distinguish completed work from uncompleted hosted publication. This documentation update does not change runtime behavior.

## What the public-write lock means

The lock is a Veyra server release guard, not a Walrus account ban or a blockchain requirement. Hosted `/v1/self-service/prepare-consent` and `/v1/self-service/confirm-and-store` reject with 403 before any write. Public direct recipient/evidence writes are also disabled. The authenticated private review action is available, but its publication button is disabled. Hosted publication daily, global and lifetime allowances are zero.

Users can still check existing public recipient evidence, inspect Tatum observations, authenticate their wallet, create private invitations, sign private receiving confirmations, accept recipients, check matching/differing addresses, revoke and delete their own contacts. Private state persists in Neon. They cannot independently publish a new public Walrus memory through the hosted app today. That is a real unfinished capability; do not describe it as available or say the lock has no user impact.

The guard protects the server-held publishing authority while admission remains unconnected. A wallet login or a private confirmation signature is not separate permission to publish immutable public content. Public publishing must bind the current live session and active accepted relationship to the exact approved record/hash, independently verify publication consent, atomically reserve a durable nonce/budget, submit at most once and expose honest completion/recovery. Local components and hosted preparation exist; the hosted signed submit route does not. A public endpoint must not reuse the local raw address/alias submission route as authenticated admission.

The missing SEAL credential is a separate exact-read verification issue, not the sole reason public submission is unfinished. A key alone would not open or complete submission. No paid Enoki plan is required for existing Mainnet relayer recall or private contacts. Existing local operator-approved writes are not retroactively denied or invalidated by this release guard.

## What is already tested

| Area | Evidence/status | Repeat required? |
|---|---|---|
| Wallet login, private recipient signature and payer acceptance | Existing operator-provided wallet recordings; local and PostgreSQL HTTP/core tests | No wholesale repeat. Regression only after relevant changes. |
| Matching and changed private address | Existing hosted operator evidence plus automated HTTP tests | Completed for the observed journey. |
| Private persistence after restart | User reported Render restart and supplied subsequent matching result; automated server restart and database reopen tests | Do not claim independently observed Render administration. No reason to repeat the whole flow merely for this audit. |
| Origin/CSRF, live sessions, ownership and replay protection | Automated core and HTTP tests with real local signatures, SQLite and PostgreSQL | Implemented/tested; not equivalent to a completed public publication flow. |
| Active relationship checks, revocation and stale preparation invalidation | Current code and passing HTTP tests; persistence after restart included | Completed automated coverage. Hosted interactive revoke recording is not established by the reviewed uploads. |
| Publication consent signature verification, exact prepared bytes, nonces, reservations and job recovery | Local cryptographic/lifecycle tests; durable SQLite and PostgreSQL tests | Components completed. Genuine full hosted signed submission/recovery remains unverified and unconnected. |
| Genuine historic Walrus writes and later relayer recall | Existing job/blob evidence; fresh seven-record product recall audit | Genuine evidence exists. Do not say no real write/read has ever occurred. |
| Independent exact plaintext decryption and receipt anchoring | Fixed historical ciphertext inspected by deployed reader; SEAL credential missing | Not completed. Relayer recall is a different verification level. |
| Wallet rejection, account switching, mobile and degraded provider UX | Defensive code and some automated coverage; no comprehensive interactive acceptance record established | Only the unrecorded failure/device cases remain; do not relist all successful happy-path checks as undone. |

Fresh local `npm run check` and 155/155 tests passed. Product commit has successful 179/179-test CI including PostgreSQL and successful six-check genuine hosted acceptance. Local audit did not have a PostgreSQL server; it does not claim another local PostgreSQL run. Uploaded private codes/addresses are not copied into this report.

## Nine-memory audit

Fresh hosted inventory returned `count:9`, `uniqueBlobCount:9`, `complete_snapshot`, no dropped metadata, and all nine `active` in the configured `veyra-dev` namespace.

| Record | Fresh active metadata | Fresh product content recovered through hosted relayer |
|---|---|---|
| 21 October SDK integration check | Yes | Not exposed by the existing typed product read routes; historical write/recall documented |
| 22 October SDK integration check | Yes | Not exposed by the existing typed product read routes; historical write/recall documented |
| Original self-wallet recipient claim | Yes | Yes |
| DeepBook V3 contract-information observation | Yes | Yes |
| DeepBook Margin package observation | Yes | Yes |
| Bybit deposit-page observation | Yes | Yes |
| DeepBook V3 SDK package observation | Yes | Yes |
| Historical wallet-control verification claim | Yes | Yes; correctly labelled expired historical control claim |
| Friend receiving-address confirmation | Yes | Yes |

Both SDK checks are real documented integration activities, not customer confirmations. The three package observations are not payment recipients. The Bybit record is user-reported deposit-page evidence, not an exchange-signed wallet attestation. The friend record is an operator-relayed consent/confirmation, not the later authenticated private Josh relationship. Do not conflate those separate events.

Read-only direct aggregator requests from this audit environment returned HTTP errors for the nine blobs. This does not establish missing storage or expiration. The hosted fixed-blob probe separately reports the friend's ciphertext hash and missing SEAL credential. No independent plaintext decryption is claimed. The JSON capture records unsuccessful download attempts as well as successful hosted reads.

Conclusion: the operator's nine-record count is supported by live inventory, and seven product records were freshly recovered. Nothing in this audit establishes fabricated records. The two SDK checks' fresh plaintext and organizer eligibility of the complete set remain distinct questions. The ten-memory threshold is not yet established. Do not create repeated filler or count private Neon confirmations as Walrus writes.

Detailed public references, IDs and observations: [captured audit results](evidence/2026-10-25-readonly-memory-audit.json).

## Finite remaining work

1. Connect secured hosted signed publication admission to the existing durable state machine, keeping the release guard until reviewed.
2. Obtain a supported no-cost verification route and demonstrate one controlled consented publication/read/recovery. If unavailable, retain the guard and disclose the limitation; do not pay or relabel recall as independent exact decryption.
3. Complete only missing interactive failure/mobile checks, not every already completed private journey again.
4. Establish the qualifying ten-memory evidence set, then finish the blog/video/submission. Existing genuine records remain part of that audit; they are not invalidated by the new release requirements.

The event checklist requires Mainnet writes, at least ten memories, relevant Tatum usage, blog, demo and public repo. It does not explicitly require unrestricted anonymous public write access or an Enoki subscription. Public product completeness and hackathon eligibility must be reported separately.

Official checklist: https://thewalrussessions.wal.app/tatum-total-recall
