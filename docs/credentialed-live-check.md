# Credentialed live checks

Never paste keys into GitHub, issues, chats, logs, or screenshots. Use local process environment variables and redact outputs.

## Install

```powershell
git clone https://github.com/0xaje/Veyra.git
cd Veyra
npm install
npm install @mysten-incubation/memwal
```

## Walrus Memory (Mainnet)

```powershell
$env:MEMWAL_PRIVATE_KEY = 'YOUR_DELEGATE_KEY'
$env:MEMWAL_ACCOUNT_ID = 'YOUR_MEMWAL_ACCOUNT_ID'
$env:MEMWAL_SERVER_URL = 'https://relayer.memory.walrus.xyz'
node scripts/memwal-smoke.mjs
```

A healthy relayer alone does not verify authentication. Require a successful signed write and successful recall of the exact content. Save only redacted output. The integration-test memory must not be represented as an actual transaction or user outcome.

## Tatum

Use your Tatum Mainnet API key only in local environment. Before running `npm run tatum:probe`, confirm the actual Sui RPC endpoint and compatible method from Tatum's current documentation; the existing generic JSON-RPC probe defaults to an EVM method and must not be treated as Sui-compatible without changing it. Never interpret a failed probe as a verified transaction.

## Acceptance status

- [ ] Walrus authenticated write succeeded
- [ ] Walrus persisted blob ID returned
- [ ] Walrus recall returned exact text
- [ ] Separate-process recall succeeded
- [ ] Tatum real Mainnet request succeeded
- [ ] Evidence references recorded without secrets
