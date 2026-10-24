# Private recipient relationships — M3/M4/M5

## Purpose and trust

Bind a recipient's signed receiving-address statement to one payer-owned private relationship. The payer separately attests that they compared the person, complete address and verification code through an existing trusted channel. Neither a wallet signature nor a checkbox proves real-world identity or authorizes payment.

This workflow does not publish any Walrus memory. Existing genuine Tatum and MemWal preflight adapters remain in use. Private relationship evidence and Walrus recall have separately labelled sources; a private contact is never represented as a recalled or completed Mainnet memory.

## One integrated journey

1. On Check Address, sign in with a Sui wallet. The transaction-free personal message binds the browser login to this origin, address, nonce, purpose and expiration.
2. Open Create invitations and confirm contacts. Create a private label and copy the generated invitation. Send it yourself through an existing trusted conversation. Veyra sends no message.
3. The recipient opens `/verify-wallet#invite=...`, signs in with their intended receiving wallet, reviews the exact private record, checks their receiving intent and signs its relationship-bound message.
4. The recipient gives the code and full address to the payer through the trusted channel. The payer API deliberately does not reveal the recipient's code.
5. The payer refreshes private contacts, selects the actual trusted channel, enters the supplied code and explicitly accepts. A recipient signature alone stays pending.
6. Select that private contact in the existing address-check form. The API authenticates ownership and compares the full destination with the accepted private address, while separately querying genuine provider evidence using only the opaque relationship ID.
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

At this stage there is no automated external identity service, contact-channel verification, public memory publication, or claim of current wallet control after signing. Private revocation prevents app acceptance; it cannot retract public immutable evidence previously written by other workflows. Private-record export/erasure policy and production backup/retention review remain separate deployment work.

## Validation

New tests use actual local Sui key generation/signatures, SQLite files and real localhost HTTP servers. They cover one complete payer/recipient journey, ownership isolation, browser/origin/CSRF binding, wrong signatures, replay, concurrent confirmation, code guessing, address changes, revocation, restart persistence, private-history isolation, secure public-mode cookie attributes and the unchanged public-memory-write lock. These tests are not Mainnet publication or browser-wallet evidence.

Interactive extension-wallet and mobile acceptance must be checked on a browser that can reach the configured private service. The cloud browser could not reach this workspace's loopback server; this limitation is not reported as a successful browser-wallet test.
