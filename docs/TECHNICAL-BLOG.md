# Veyra: remembering recipient evidence before the next transfer

By Aje Oluwaseun Isaac (0xaje) · 25 October 2026

A familiar-looking address is not necessarily the intended destination. In May 2024, an Ethereum address-poisoning incident involving 1,155 WBTC was reported at approximately $71 million. Later reporting documented recovery of nearly all available funds. Chainalysis describes the underlying mechanism: a lookalike address is inserted into transaction history and later copied by mistake. This is a real example of the broader problem, not a Sui incident or evidence that Veyra would certainly have prevented it. [1][2]

Veyra helps a payer compare a proposed Sui Mainnet destination with available recipient evidence before sending funds. It does not execute transfers, establish identity or guarantee that an address is safe. Its practical question is: what do the available records say about this destination, and what still needs independent confirmation?

## One check, with evidence people can inspect

The main checker needs a recipient identifier and full Sui address. No wallet sign-in is required. Veyra recalls relevant Walrus records and compares normalized full addresses. A match remains a remembered claim, not current recipient approval. A difference prompts independent review. Conflicting or missing evidence is never a safe-payment verdict.

An optional historical transaction digest adds Tatum Sui Mainnet gRPC observations. Transaction participants and balance changes provide context; they do not establish who the intended payee is. The genuine historical transaction used in our acceptance check was not proof of the recipient's ownership or approval. Tatum supplies blockchain data; Walrus supplies memory.

## Memory that survives the browser tab

The first versions could read existing memories, but ordinary visitors could not save their own checks from the hosted app. Completing that connection mattered more than adding another feature.

A visitor now chooses Save this check, reviews the exact assessment record and disclosure, then explicitly consents. The server accepts only its own recent authenticated assessment ticket. It binds consent to the record hash, browser access and origin, reserves capacity in a durable transaction, and submits once through the genuine MemWal SDK. Pending acceptance is distinguished from completed storage.

Activity History retains the receipt and a private snapshot/index in Neon. A secure browser cookie restores access on return. A private recovery code can rotate access to another browser without involving the builder. Browser access and recovery credentials are excluded from Walrus records. Clearing browser data without retaining a recovery code can lose access through the app; storage leases also limit Walrus availability.

## What the memory changes

Earlier recipient evidence changes a fresh check from having no baseline to explaining a match, difference or conflict. Saved assessment memories separately let the person revisit what Veyra found and inspect the evidence used at that time. These are different purposes: an unsigned assessment must never become a recipient's approval merely because it was saved.

Optional private recipient contacts use wallet-authenticated invitations, a signed receiving statement, independent payer acceptance and Neon persistence. Their private labels and relationship records are not automatically published. Signed public recipient-confirmation publication remains a separate release boundary.

## A genuine saved assessment

On 25 October, a live hosted assessment used the existing friend recipient observation and a real Tatum transaction reference. Without wallet sign-in, one reviewed assessment was saved to Mainnet Walrus:

- Completed job: `5457cce7-af65-4a83-a4e2-eb668a3e5177`.
- Blob: `kHbA42YBtKJ7V4LtqbWuU6S5tTqsIZ4RxVtwTvO60QI`.
- SHA-256: `4794f208308e8661b980a475839c255d3cb1155da4ed1741cebdffb2f6ea6aa0`.

MemWal recall returned the expected blob and matching record bytes/hash. The saved card remained after closing the original tab, reopening history and deploying the final update. This was one genuine saved assessment, not a transfer or a fabricated customer incident. The captured receipt is linked below. [3]

The inventory subsequently listed ten unique active blobs. Two historical records are SDK integration checks, not customer recipient confirmations; three others are package-source observations, not payment destinations. Their purposes are disclosed rather than inflated into ten verified recipients. [4]

## Engineering boundaries

The release passed 191 automated tests, including real SQLite/PostgreSQL persistence, plus six genuine hosted acceptance checks. Tests cover browser isolation, exact-record consent, altered tickets, replay, quota persistence, recovery rotation and restart behavior. Fixtures are labelled and never represented as Mainnet writes.

Relayer-returned exact-blob/hash verification is explicitly labelled as such. Independent ciphertext decryption is not claimed: direct Mainnet SEAL access remains unavailable under the project's zero-cost constraints. Signed recipient-publication routes remain locked separately. Physical-phone wallet rejection and cross-device interactive acceptance remain final manual checks; automated coverage is not presented as their substitute.

Veyra's goal is to make useful evidence and uncertainty understandable before a person decides to send. The interface stays simple; the receipts and limitations remain inspectable.

## Try it and inspect the evidence

- Product: https://veyra-rs1l.onrender.com/
- Saved history: https://veyra-rs1l.onrender.com/history
- Source: https://github.com/0xaje/Veyra
- [1] Chainalysis, Anatomy of an Address Poisoning Scam, 23 October 2024: https://www.chainalysis.com/blog/address-poisoning-scam/
- [2] The Block, recovery report, 11 May 2024: https://www.theblock.co/news/ecosystems/2024-05-11-victim-of-71-million-address-poisoning-attack-recovers-funds-following-negotiations-293908
- [3] Genuine receipt and record: https://github.com/0xaje/Veyra/blob/main/docs/evidence/2026-10-25-saved-assessment-acceptance.json
- [4] Inventory capture: https://github.com/0xaje/Veyra/blob/main/docs/evidence/2026-10-25-inventory-after-save.json
