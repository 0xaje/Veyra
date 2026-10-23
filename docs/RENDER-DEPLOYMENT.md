# Render deployment runbook

Veyra currently serves its HTML frontend and JSON API from one Node process. The repository includes a Render Blueprint (render.yaml). The first deployment is deliberately read-only: `VEYRA_PUBLIC_MODE=true` disables recipient memory writes and assessment history for all public visitors.

## Prerequisites and blockers

1. The Blueprint now selects Render Free (`plan: free`). Free services may spin down when idle, take time to wake, and are unsuitable for guaranteed continuous judge access. Render may still require account verification or payment details; check the dashboard before deploying.
2. Connect the GitHub repository `0xaje/Veyra` to Render and deploy the current `main` branch. Review the Blueprint service configuration before approving deployment.
3. Configure legitimate `MEMWAL_PRIVATE_KEY` and `MEMWAL_ACCOUNT_ID` in Render's secret environment settings, never in Git. These credentials are used for recall; the public API blocks writes.
4. For Tatum, configure `TATUM_API_KEY`. The Blueprint clones `MystenLabs/sui-apis` at build time and sets `SUI_PROTO_DIR=.render/sui-apis/proto`. Confirm that the build actually fetches the official proto files and that a hosted live transaction-digest check succeeds. The clone is not pinned to a revision, so reproducibility and upstream availability remain risks.
5. Confirm that the Walrus SDK's network, namespace, and credentials match the genuine previously stored memory. Do not infer Mainnet provenance from successful recall alone.
6. Do not set `VEYRA_HISTORY_FILE` or an authorization file in public mode. Public history is deliberately disabled.

## Deployment validation

- Open the HTTPS home page, /docs, /memory, /history, and /health in a private browser.
- /health should return `publicMode: true`, `memoryWritesEnabled: false`, and `paymentAuthorized: false`.
- POST /v1/recipient-memory must return HTTP 403 without writing anything.
- POST /v1/preflight with a real known counterparty and Sui Mainnet address; confirm actual Walrus provider status.
- With Tatum configured and official proto files deployed, submit a real historical Sui transaction digest and confirm actual Tatum provider status.
- Verify one-character address difference yields review-required and never payment authorization.
- Check that /v1/history contains no private assessments.

## Not yet implemented

Production request throttling, full authentication for memory writes, a persistent production history store, and independently confirmed deployment-side verification of Tatum proto assets. Until those exist, keep public mode read-only and do not promise production-grade abuse resistance. A public read-only endpoint can still incur provider charges, so monitor traffic and provider limits.
