# Self-service saved assessments

This completes the optional **check → review → save → return → recall** journey without wallet sign-in. It does not open recipient-confirmation publication or make an unsigned visitor authoritative over another wallet.

## User journey

1. Run the ordinary public check. No sign-in or memory write occurs.
2. Choose **Save this check**. A persistent, random, HttpOnly same-site browser credential is created, and Veyra prepares the exact assessment record for review.
3. Review the disclosure and exact JSON/hash; explicitly consent. The server accepts only its own recent HMAC-authenticated assessment ticket, not caller-invented findings. Private relationship assessments are not offered for this publication path.
4. Veyra atomically binds consent to the browser, exact record, origin and durable reservation, then submits once with a server-derived idempotency key. Pending, stored, failed and uncertain states remain distinct. A completed provider job/blob is necessary before **Stored on Walrus** appears.
5. Return to Activity History on the same browser. The secure cookie lasts up to 180 days; Neon holds the durable owner-isolated receipt index and record snapshot. Session-only checks remain separately labelled.
6. Choose **Recall from Walrus**. The supported MemWal relayer returns plaintext; Veyra requires the expected blob ID and hashes its exact returned bytes against the saved record hash. This is explicitly `verified_via_memwal_recall`, not independent exact ciphertext decryption. Failure to find a similarity-search result is not proof that the memory was deleted.
7. Optionally obtain a private recovery code from history. Restoring it on another browser rotates the access credential, invalidates the used code and previous browser access, and preserves the receipt/history collection. Codes are never placed in URLs, logs, Walrus records or third-party requests.

## Scope and privacy

`veyra.assessment_memory.v1` records a server-performed check: address, finding, timestamp, evidence references and Tatum transaction reference when supplied. It contains `recipientConfirmed:false`, `identityVerified:false`, `paymentAuthorized:false`. Counterparty/contact labels, browser tokens, recovery codes and private relationship details are excluded from the Walrus record. Labels remain private in Neon to make history understandable.

Existing recipient evidence readers admit their existing explicit record types only. Saved assessments cannot become owner confirmations, wallet-control proofs, safe recipients or payment authorization. Tatum supplies blockchain observations; it is not a second memory database.

Walrus Memory encrypts records under the existing account policy. The service can read its own account's memories; a browser credential controls access through Veyra. This is not user-controlled encryption or a claim that the service cannot see the data. Stored copies can outlive private index deletion and browser access. Walrus availability depends on the storage lease; the 180-day browser cookie is not a 180-day storage guarantee. Exports/recovery codes must be kept private.

## Safeguards and zero-cost bounds

- Existing reviewed Neon driver, verified TLS, parameterized queries and cross-instance transaction/advisory locks; no ephemeral fallback.
- Canonical same-origin POSTs, cross-site rejection, JSON-only bounded bodies, secure HttpOnly SameSite=Strict cookies, CSRF and fresh live credential checks.
- Exact server-generated assessment tickets expire after 15 minutes; reviewed save drafts expire after 10 minutes. Durable consent digest/timestamp, nonce and provider idempotency prevent altered or duplicate submissions.
- Persisted policy: 3 submissions/browser/day, 20/service/day, 100 total, at most 50 drafts/history records per browser, 1,000 outstanding drafts service-wide, 500 new browser credentials/day. Failed/uncertain jobs continue consuming allowance; a new browser cannot reset the service ceiling. These are abuse/allowance caps, not monetary pricing guarantees.
- Provider concurrency is bounded and read requests have durable limits. Credentials remain server-side. No payment, subscription, wallet top-up or paid fallback is performed by this flow. It uses the existing MemWal service allowance; exhausted provider access fails honestly.
- Unknown provider acceptance never automatically resubmits. Accepted jobs are polled by their saved job ID after refresh/restart. The small crash window after provider acceptance but before persisting the job ID remains `submitting`/unknown and requires reconciliation, not a blind retry.
- Recovery rotates tokens; old browser sessions and recovery codes cannot authorize another write afterward. Anonymous browser authentication is a saved-history capability, not a real-world identity.

## Distinct release boundaries

Health distinguishes `assessmentMemorySavingEnabled` from `recipientPublicationEnabled`. Generic write capability may be true for assessment saving while recipient publication remains false. Old raw recipient/evidence write routes remain 403 on public hosting. The wallet verification page reads the recipient-specific flag and does not accidentally expose the legacy recipient submit form.

The user explicitly approved unsigned self-service assessment saving in this conversation. This is a narrowly scoped extension of the integrated contract, not a relaxation of signed recipient-publication requirements. Missing independent Mainnet SEAL access is disclosed on receipt checks; it does not falsely claim a successful direct decryption.

## Acceptance

Automated tests use real SQLite/PostgreSQL persistence, cryptographic HMACs and HTTP origin/session boundaries. Lifecycle fixture jobs are labelled local and are not live provider responses. Genuine deployed submission, receipt, recall, return/recovery and the existing read-only Tatum/Walrus checks must be recorded separately before claiming live acceptance. No test that only opens a page counts as a successful memory write.

## Genuine hosted acceptance — 25 October 2026

At product commit `9a6fc0c`, the authorized live browser check performed a genuine recipient assessment using existing public friend evidence and a genuine historical Tatum transaction reference. Without wallet sign-in, the exact displayed record was reviewed/consented, submitted once, completed with job `5457cce7-af65-4a83-a4e2-eb668a3e5177` and Walrus blob `kHbA42YBtKJ7V4LtqbWuU6S5tTqsIZ4RxVtwTvO60QI`. Hosted recall persisted `verified_via_memwal_recall` against SHA-256 `4794f208308e8661b980a475839c255d3cb1155da4ed1741cebdffb2f6ea6aa0`. Closing the original tab and reopening Activity History recovered the saved card while the new tab's temporary session history was empty.

This is one genuine saved assessment, not a transfer, fabricated recipient or independent exact ciphertext decryption. It does not claim that the unrelated historical transaction proves recipient ownership. The first live test exposed a frontend verification-message redraw issue; receipt verification is now rendered from the persisted job state so it remains visible after refresh. Recovery has real database/crypto coverage; interactive cross-device recovery has not been claimed. See [the factual receipt and record](evidence/2026-10-25-saved-assessment-acceptance.json).
