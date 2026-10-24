# Private recipient relationships — M3/M4/M5

## Purpose and trust

Bind a recipient's signed receiving-address statement to one payer-owned private relationship. The payer separately attests that they compared the person, complete address and verification code through an existing trusted channel. Neither a wallet signature nor a checkbox proves real-world identity or authorizes payment.

This workflow does not publish any Walrus memory. Existing genuine Tatum and MemWal preflight adapters remain in use. Private relationship evidence and Walrus recall have separately labelled sources; a private contact is never represented as a recalled or completed Mainnet memory.

## One integrated journey

1. Open Saved recipients from the navigation (optional), then sign in with a Sui wallet. The transaction-free personal message binds the browser login to this origin, address, nonce, purpose and expiration.
2. Open Create invitations and confirm contacts in Saved recipients. Create a private label and copy the generated invitation. Send it yourself through an existing trusted conversation. Veyra sends no message.
3. The recipient opens `/receive-private#invite=...`, signs in with their intended receiving wallet, reviews the exact private record, checks their receiving intent and signs its relationship-bound message.
4. The recipient gives the code and full address to the payer through the trusted channel. The payer API deliberately does not reveal the recipient's code.
5. The payer refreshes private contacts, selects the actual trusted channel, enters the supplied code and explicitly accepts. A recipient signature alone stays pending.
6. Choose Use in address check to return to the existing address-check form with that contact selected. The API authenticates ownership and compares the full destination with the accepted private address, while separately querying genuine provider evidence using only the opaque relationship ID.
7. A fresh invitation is required for a new address. The old accepted address remains until explicit payer acceptance; pending changes are shown. Previous accepted addresses and private audit events are retained. Revocation prevents further acceptance and is visible to preflight.

Private contact labels are never sent to Tatum/MemWal queries or put in public blobs. Private checks are excluded from the legacy shared journal and browser-session assessment export. Private confirmation audit history is accessible only to the payer; recipients can recover only their own receiving confirmations and codes.

## Local setup

Requires Node 24 and an explicitly chosen private persistent database path. Starting the service creates private state but does not publish a memory or transfer funds.

```bash
VEYRA_RELATIONSHIP_DB="$PWD/.veyra-data/relationships.sqlite" \
node --experimental-strip-types scripts/preflight-api.mjs
```

Open `http://127.0.0.1:8787`. A compatible installed Sui wallet is needed for interactive signing. Existing real provider credentials may be loaded from the operator's private environment when read-only Tatum/Walrus checks are wanted. Without them, provider availability is honestly reported as unavailable.

## Hosted deployment gate

The current free/ephemeral Render blueprint is NOT configured to hold private contacts. The new UI reports the feature unavailable until an operator supplies reviewed persistent storage. No public configuration or paid hosting change is made by this implementation.

For an explicitly reviewed HTTPS deployment, all of these are required:

- `VEYRA_RELATIONSHIP_DB`: absolute path on persistent private storage.
- `VEYRA_ENABLE_PRIVATE_RELATIONSHIPS=true`.
- `VEYRA_RELATIONSHIP_STORAGE_REVIEWED=true`, only after actually reviewing persistence, backups, access and retention.
- `VEYRA_PUBLIC_ORIGIN`: exact canonical HTTPS origin.

Do not use independent SQLite files across multiple hosts and describe them as shared state. Review at-rest encryption, backups, retention and operational access before storing real private contacts on a host. Database/WAL/SHM files, signatures, sessions and invitation tokens must never be committed, published or logged. Public Walrus publication remains unconditionally disabled regardless of these settings.

## Security boundaries

- Random 256-bit browser/session/invitation/nonces; session and invitation bearer tokens are hashed in the database.
- Domain-bound single-use login messages and recipient messages, verified with the real Sui signature verifier. Failed signatures consume their nonce. A browser binding cookie prevents login swapping.
- HTTP-only, SameSite=Strict cookies; hosted cookies use Secure and the `__Host-` prefix. One-hour fixed sessions, rotation on login, revocation on logout.
- Exact-origin checks and session CSRF tokens on private state changes and private-scoped preflight. Missing owner authentication cannot fall back to global aliases.
- Transactional invitation/nonce state, private payer ownership checks, bounded attempts and durable code-guessing limits.
- Invitation secrets live in URL fragments, are removed from the browser address bar, and are sent only in authenticated JSON requests. Referrer policy is no-referrer. Possession of a link can propose an address but cannot accept it for the payer.
- Code checking establishes consistency with the recipient's signed claim. The trusted conversation remains a payer attestation, not a cryptographically verified external identity.
- User labels and wallet/provider text render as text nodes. Session expiry, wallet changes and logout clear private contact views.
- Raw signatures remain in the private database for audit; public responses and public memory records do not contain them.

## Limitations and anti-patterns

Do not send an invitation through new contact details from a suspicious payment request. Do not accept a code copied from an untrusted sender, treat a matching wallet as identity proof, or publish private labels to satisfy a memory count. A stolen invitation can cause a misleading proposal or denial of service; cancel/reissue it and independently verify the person rather than accepting blindly.

At this stage there is no automated external identity service, contact-channel verification, public memory publication, or claim of current wallet control after signing. Private revocation prevents app acceptance; it cannot retract public immutable evidence previously written by other workflows. Owners can export their private contact summaries/history and delete individual contacts with exact-label confirmation. Deletion removes associated drafts, invitations, claims and audit events from active storage, including recipient recovery views. It does not erase external copies, existing backups or public immutable records. Production backup/retention review remains deployment work.

## Validation

New tests use actual local Sui key generation/signatures, SQLite files and real localhost HTTP servers. They cover one complete payer/recipient journey, ownership isolation, browser/origin/CSRF binding, wrong signatures, replay, concurrent confirmation, code guessing, address changes, revocation, restart persistence, private-history isolation, secure public-mode cookie attributes and the unchanged public-memory-write lock. These tests are not Mainnet publication or browser-wallet evidence.

Interactive extension-wallet and mobile acceptance must be checked on a browser that can reach the configured private service. The cloud browser could not reach this workspace's loopback server; this limitation is not reported as a successful browser-wallet test.


## Consumer entry points (M5)

- `/`: Check recipient remains the primary form. No private sign-in/management panel is mounted above it. An optional link opens Saved recipients. An already authenticated person with active contacts can choose one in the form.
- `/contacts`: dedicated payer-owned Saved recipients page with sign-in, invitations, acceptance, refresh, revocation and recent confirmation history.
- `/verify-wallet`: existing wallet-control verification flow, with a separate link to private receiving. Verification alone does not save a public recipient record.
- `/receive-private`: invitation-based private receiving and previous confirmations. New invitation links use this path; old `/verify-wallet#invite=...` links remain supported.

All entry points share the current light/dark theme and mobile navigation. No user needs to contact the builder to operate an enabled private flow. The hosted flow is still unavailable until its deployment gate is actually completed; adding navigation does not satisfy that gate.

## Remaining public launch work and operator ownership

Users must never supply hosting credentials, database configuration, API keys or contact the builder for each registration. Configure the service once, then users perform their own signed confirmations.

1. Provision persistent private storage for the existing service and supply the four hosted settings above. Keep one process/host for this SQLite design. Do not change the review flag until persistence, access controls, backups and retention have actually been reviewed.
2. Test restart persistence and recovery against that mounted storage, inspect HTTPS cookie/origin behavior, and complete a genuine browser-wallet payer → recipient → acceptance → address-check journey. Local automated signatures are not a substitute for this hosted acceptance.
3. Verify the implemented owner-controlled private data export/deletion and publish a concrete backup/retention policy before opening private storage broadly. Revocation is not deletion.
4. Independently finish public Walrus publication gates from the integrated contract: verified exact-ID retrieval, durable discovery, signed exact-record consent, authenticated wallet authorization, durable quotas/idempotency and spending limits, then a genuine write/read receipt. Existing flags must not bypass these requirements.

The repository connector can publish application changes but does not expose the Render service's storage or environment administration. Do not claim that deployment configuration has changed based on a Git commit alone. No paid storage has been ordered by this change.
