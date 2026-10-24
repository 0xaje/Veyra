# Veyra architecture and evidence contract

The approved product scope is [INTEGRATED-PRODUCT-CONTRACT.md](INTEGRATED-PRODUCT-CONTRACT.md). Current implementation and open acceptance gates are tracked in [PRODUCT-HARDENING.md](PRODUCT-HARDENING.md).

## Read-only payer journey

1. The payer supplies a recipient identifier, proposed Sui Mainnet destination and optional real historical transaction digest.
2. The API validates input and bounds public provider work. It uses genuine MemWal recall and optional Tatum Sui gRPC transaction observation.
3. The unified interpreter distinguishes recipient claims, recipient observations, non-recipient package/object context and historical wallet-control claims. It does not establish identity.
4. Comparison, conclusion and timeline derive from the same applicable recipient evidence. Different addresses remain conflicting; a newer record does not silently override an older one.
5. The UI shows sources, timestamps, blob references, uncertainty and independent-verification steps. Every assessment has paymentAuthorized:false.
6. Public server history is disabled. Browser-session history and opt-in local journaling are distinct and labelled.

## Local receiving-confirmation journey

1. An explicitly configured private SQLite ledger retains the exact non-secret candidate JSON, its complete SHA-256 hash, canonical consent and expiration.
2. The recipient wallet signs a separate publication consent message. The server verifies the signature against the receiving address and exact prepared record.
3. SQLite commits nonce consumption, stable idempotency and capacity reservation atomically before provider submission.
4. Genuine MemWal acceptance becomes a durable pending job. Only an SDK completion with a blob ID becomes a stored receipt.
5. Recovery polls an existing accepted job. Unknown acceptance is retained as uncertain and never automatically resubmitted. Unresolved jobs retain capacity across day rollover.
6. Public publication remains unconditionally disabled. Local functionality does not satisfy authenticated public relationship/session or persistent deployment gates.

## Retrieval and inventory limits

MemWal semantic recall is non-exhaustive. Inventory metadata is not plaintext verification, identity evidence, current availability proof or a qualifying-memory count. Exact-ID authenticated download/decryption and trusted payload-hash verification remain open. Original stored records are never silently rewritten.

SQLite coordinates processes sharing one durable database file on one host. Separate host-local files do not share quotas. Ephemeral deployment storage is insufficient. Existing legacy ledger data must be reconciled before switching stores.

## Trust boundaries

- Key control is not recipient identity, supplier relationship or payment safety.
- Recalled signature-verification labels are historical claims unless independently reverified.
- Public storage disclosures must minimize personal information and explain withdrawal limitations.
- Never request seed phrases or put server credentials/raw signatures in public records.
- No payment signing, transfer execution or authorization is performed.
- Missing evidence, malformed state, provider failure and uncertain storage remain explicit.
