# Veyra: remembering recipient evidence before the next transfer

By Aje Oluwaseun Isaac (0xaje) · 25 October 2026

A transfer can be technically successful and still reach the wrong person. The blockchain records the destination that was submitted; it does not know which person the sender meant to pay. Veyra starts at that gap: remembering the evidence behind a recipient address and making a changed destination visible before the next transfer.

## The problem is documented, not hypothetical

**May 2024: a lookalike destination and approximately $71 million in WBTC.** An Ethereum user sent 1,155 WBTC to an address resembling an intended destination. Chainalysis values the initial transfer at about $68 million; reporting also used approximately $71 million as prices changed. The attacker later returned funds, and The Block reported recovery of nearly all available funds. Recovery matters: this should not be presented as a permanent $71 million loss. [1][2]

**August 2023: $20 million in USDT and an emergency freeze.** Crypto Briefing documented a transfer to a lookalike address after a zero-value phishing entry appeared in transaction history. Tether blacklisted the destination quickly. This was a misdirected transfer followed by intervention, not evidence that all such mistakes are reversible. [5]

**A wider pattern, including ordinary typing errors.** A USENIX Security 2025 study of Ethereum and BSC, covering July 2022–June 2024, identified 6,633 successful address-poisoning transfers totaling at least $83.8 million. Separately, its Appendix D classified 681 transfers from 501 users as likely accidental typing errors, with approximately $5.5 million in losses. These are research classifications, not interviews establishing each sender’s intent. The poisoning total excludes the WBTC incident because the study’s loss measurement focused on major stablecoins; the figures should not be casually combined into a new headline total. [6]

These sources document deceptive history, confusing addresses and probable typing mistakes. They do not establish that victims lacked a memory product, and they do not prove Veyra would have prevented a particular incident. They concern Ethereum/BSC; Veyra currently supports Sui Mainnet. The design lesson is narrower and practical: preserve the origin of a recipient claim, compare the full address, and make uncertainty visible.
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

## Try Veyra and inspect the evidence

Every link below has a specific purpose. External incident research explains the problem; product receipts document what Veyra actually did. Neither is a substitute for confirming your intended recipient.

- **[Open the address checker](https://veyra-rs1l.onrender.com/)** — compare a proposed Sui destination with available evidence; no sign-in required.
- **[Open saved checks](https://veyra-rs1l.onrender.com/history)** — return to this browser’s stored assessment receipts and request a fresh Walrus recall.
- **[Explore the source code](https://github.com/0xaje/Veyra)** — inspect the implementation, tests, security boundaries and setup instructions.
- **[1 · Read the Chainalysis investigation](https://www.chainalysis.com/blog/address-poisoning-scam/)** — how the May 2024 Ethereum incident unfolded; published 23 October 2024.
- **[2 · Read the recovery report](https://www.theblock.co/news/ecosystems/2024-05-11-victim-of-71-million-address-poisoning-attack-recovers-funds-following-negotiations-293908)** — The Block’s 11 May 2024 account of the funds returned after that incident.
- **[3 · Inspect Veyra’s completed save receipt](https://github.com/0xaje/Veyra/blob/main/docs/evidence/2026-10-25-saved-assessment-acceptance.json)** — the genuine job, blob, exact record and hash from the hosted self-service save; no payment was made.
- **[4 · Inspect the ten-record inventory](https://github.com/0xaje/Veyra/blob/main/docs/evidence/2026-10-25-inventory-after-save.json)** — the captured Mainnet metadata inventory, including the disclosed SDK checks and package observations.
- **[5 · Read the USDT incident report](https://cryptobriefing.com/tether-swiftly-blacklists-phishing-address/)** — Crypto Briefing, 1 August 2023: the $20 million misdirection and Tether’s blacklist response.
- **[6 · Read the USENIX research](https://www.usenix.org/conference/usenixsecurity25/presentation/tsuchiya)** — Blockchain Address Poisoning, 2025; open-access paper, methodology and accidental-transfer analysis in Appendix D.
