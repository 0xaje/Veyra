# Veyra — submission copy

Prepared from the deployed product and recorded evidence, 25 October 2026. Review account-specific details privately. This file is not a submission confirmation.

## Project name

Veyra

## Recommended track

Consumer Finance Apps

## Short description

Veyra helps people compare a Sui receiving address with remembered recipient evidence before sending funds. It combines Walrus Memory with Tatum Mainnet observations, highlights address differences and uncertainty, and lets users save and revisit their own assessments without wallet sign-in. It never executes or authorizes payments.

## Full project description

Lookalike wallet addresses can turn a routine transfer into a costly mistake. Veyra gives the payer an evidence-based checkpoint before sending on Sui Mainnet.

Users enter a recipient identifier and the full receiving address without connecting a wallet. Veyra recalls relevant Walrus records and explains whether the proposed destination matches, differs from, or conflicts with available claims. Missing records remain unknown. An optional transaction digest adds genuine Tatum Sui Mainnet historical observations; those observations do not prove recipient identity or approval.

Users can independently save a completed check: review its exact assessment record, explicitly consent, receive a real Walrus job/blob receipt, and return to Activity History. Persistent browser access and a rotating private recovery code remove the need for builder assistance. The saved record is an assessment, never an owner confirmation. Private recipient invitations, wallet-signed receiving statements and independent payer acceptance are available as an optional, separate Neon-backed workflow.

The released implementation passed 191 automated tests, including real PostgreSQL and SQLite persistence, and six genuine hosted integration checks. Live acceptance includes a completed unsigned self-service assessment save, matching-hash relayer recall and history recovery after tab closure and redeployment. The recorded inventory lists ten unique active Mainnet memory blobs, with purposes disclosed, including two historical SDK integration checks.

Veyra never signs, executes or authorizes transfers. Relayer-based record verification is labelled honestly; independent ciphertext decryption and signed public recipient-confirmation publication are not claimed as completed.

## How Walrus was used

Walrus Memory retains recipient evidence and consented assessment records across sessions. Earlier recipient claims change later match/difference findings; saved assessments let the user revisit the evidence and result of an earlier check. The server uses the real MemWal SDK, durable idempotent job state, completed blob receipts and a separate recall check against the expected ID and record hash. Pending jobs are not counted as completed memories.

## How Tatum was used

Tatum's Sui Mainnet gRPC integration retrieves genuine historical transaction information when a digest is supplied. The interface explains transaction observations separately from recipient intent and ownership. A real historical digest was observed in the hosted acceptance checks and captured in the saved-assessment record.

## Experience building with Walrus

The integration supported genuine Mainnet memory writes and later recall. The main engineering lessons were to distinguish accepted jobs from completed blobs, preserve exact approved bytes, make retry/recovery durable, and keep similarity-search incompleteness visible. An earlier legacy comparison inconsistency was corrected through the unified evidence interpretation. Direct ciphertext verification has a different access requirement from relayer recall, so the UI and evidence disclose that distinction.

## Experience building with Tatum AI Builder

The repository and evidence reviewed here do not establish that Tatum AI Builder was the primary development platform. Describe only actual usage. If it was not used, state: “Not used for this build. Veyra integrates Tatum Sui Mainnet RPC directly.” Do not claim the dedicated AI Builder award merely because Tatum RPC was used.

## Links

- Working product: https://veyra-rs1l.onrender.com/
- Public repository: https://github.com/0xaje/Veyra
- Technical blog: https://veyra-rs1l.onrender.com/docs#build-story (verify after publication)
- Evidence: https://github.com/0xaje/Veyra/blob/main/docs/evidence/2026-10-25-saved-assessment-acceptance.json
- Demo video: supply the actual public viewing URL after recording; no placeholder URL should be submitted.

## Account-owner fields

Verify the actual email, Discord handle, LinkedIn, Tatum account ID, Sui prize address, MemWal account object ID and MEMWAL_AGENT_ID from the correct dashboards. Use the official form's definitions; do not confuse the delegate public key with the private key. Never publish keys, passwords, database URLs, recovery codes or private recipient invitation codes. How you heard about the event and whether this is your first Web3 project must reflect your actual experience.
