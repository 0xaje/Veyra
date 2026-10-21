# Local setup (Windows PowerShell)

Install Node.js 22 or newer. Run `npm install`, `npm run check`, and `npm test`.

## Free Tatum key

1. Visit https://dashboard.tatum.io/ and create an account.
2. Create or locate your API key. Do not share or commit it.
3. Consult https://docs.tatum.io/ for an official Sui-compatible RPC URL and method; this project will prefer Sui to match hackathon judging requirements.
4. In PowerShell, set `$env:TATUM_API_KEY="YOUR_KEY"`, `$env:TATUM_RPC_URL="OFFICIAL_RPC_URL"`, and `$env:TATUM_RPC_METHOD="METHOD_FROM_DOCS"`.
5. Run `npm run tatum:probe`. Save a redacted result for verification.

The probe uses JSON-RPC; the chain-specific method and endpoint must be checked before running. No successful request is claimed yet.

## Walrus

Mainnet aggregator: https://aggregator.walrus-mainnet.walrus.space . Reading an existing blob is public; writing on mainnet needs a funded Sui/WAL signing workflow or an authenticated publisher. Do not paste wallet secrets into chats or GitHub. See https://docs.wal.app/docs/network-reference .

**Hackathon requirement:** verify and implement the distinct Walrus Memory integration and at least ten actual mainnet memories. Plain blob uploads are not sufficient proof.
