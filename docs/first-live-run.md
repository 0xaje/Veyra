# First live integration run

## Requirements

- Install Node.js 22+ and run `npm install`.
- Create a Tatum free account at https://dashboard.tatum.io/.
- Create your own Walrus Memory account and delegate key at https://memory.walrus.xyz/ (Mainnet).
- Never paste keys in issues, chat, frontend code, or GitHub.

## Walrus Memory Mainnet write/read

Install `@mysten-incubation/memwal` with `npm install @mysten-incubation/memwal`.

In Windows PowerShell, set `$env:MEMWAL_PRIVATE_KEY='YOUR_DELEGATE_KEY'` and `$env:MEMWAL_ACCOUNT_ID='YOUR_ACCOUNT_ID'`. Then run `node scripts/memwal-smoke.mjs`.

The script writes a uniquely identified, clearly labeled integration-check memory, waits for a real Mainnet blob ID, recalls it, and fails if exact content cannot be found. These verification memories must **not** be passed off as real transaction histories or fabricated outcomes.

## Tatum RPC

Obtain the API key from Tatum. The initial JSON-RPC probe exists, but chain-specific Sui method support must be confirmed before invoking it. We prioritize Sui because the official hackathon judging rubric explicitly names Tatum Sui RPC.

## Acceptance

A passing command output is necessary but not sufficient: save a redacted run log, re-run retrieval in a separate process, and record network identifiers and storage evidence. No integration is considered live until executed successfully.

References: https://docs.wal.app/walrus-memory/sdk/examples and https://thewalrussessions.wal.app/tatum-total-recall
