# Free Neon storage for Veyra — M3/M5

Keep the existing Render Free web service and use Neon Free PostgreSQL for private recipient relationships. This change does not publish anything to Walrus or authorize a payment. It does not require a paid Render disk or a paid Neon plan.

## 1. Create the database (account owner, once)

1. Open https://console.neon.tech and sign up/sign in yourself. Do not send passwords, API keys or connection strings to chat.
2. Stay on **Free**. Create a project named `veyra`, choose PostgreSQL **17**, and choose the same region as the Render service if offered (otherwise the nearest available region). Check Render's service settings for its region first.
3. Keep the default database/role, or create a dedicated database/role for Veyra. Use this project only for Veyra, without unrelated private data.
4. Open **Connect**. Select the project's database and role. Turn **Connection pooling** on.
5. Copy the raw PostgreSQL URL, starting with `postgresql://`. Do not copy the `psql` command, surrounding quotes, or an entire environment assignment. Keep the SSL/channel-binding options provided by Neon. Store this URL privately.

The database is server-only. Users do not need a Neon account and must never receive the database password. Veyra uses purpose-bound Sui personal-message signatures for its own authentication; creating a Neon project does not replace that authentication.

## 2. Configure the existing Render service (account owner, once)

Wait until the PostgreSQL integration is present in the deployed `main` build and Verify product is green. Open the existing Veyra service in the Render Dashboard, then **Environment**.

Set:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | The private raw Neon pooled connection URL |
| `VEYRA_PUBLIC_MODE` | `true` |
| `VEYRA_PUBLIC_ORIGIN` | `https://veyra-rs1l.onrender.com` (use the actual canonical origin if your deployment changes) |
| `VEYRA_ENABLE_PRIVATE_RELATIONSHIPS` | `false` while reviewing the configuration |

Remove `VEYRA_RELATIONSHIP_DB` if present. Configuring SQLite and PostgreSQL simultaneously is rejected; no silent fallback can lose private data on a sleeping Render instance. Keep existing genuine Tatum/MemWal credentials unchanged. Do not add database credentials to the repository, frontend, screenshots, logs or chat.

Select **Save, rebuild, and deploy** when deploying new source/dependencies; **Save and deploy** is enough for environment-only changes on the updated build. Check the deployed commit in `/health`.

## 3. Review and activate a limited independent-user test

Before setting the review flag, confirm:

- The Neon project is Free; no paid upgrade, paid disk or subscription was selected.
- The URL is stored only in Render's server environment. Hosted connections enforce certificate-verified TLS; the app rejects insecure URI options.
- The canonical origin matches the public HTTPS site exactly, with no trailing slash/path.
- This is a dedicated private database. The role can create the `veyra_private` schema and its tables; do not grant database access to testers.
- The owner understands private records/signatures remain until the contact owner deletes the associated contact. Deletion removes active application records, not copies already exported or provider recovery history. Neon Free recovery is limited; do not promise a paid backup SLA.
- The deployment's PostgreSQL tests have passed. The test uses real disposable PostgreSQL databases/local signing keys; it is not proof of a hosted Neon connection or an extension-wallet session.

Then set these two environment values and redeploy:

```dotenv
VEYRA_RELATIONSHIP_STORAGE_REVIEWED=true
VEYRA_ENABLE_PRIVATE_RELATIONSHIPS=true
```

At startup, Veyra creates/validates its dedicated schema and shared CSRF key under a transaction lock. Startup fails if an enabled private database cannot be initialized; it never quietly switches to local ephemeral storage. No user contacts or fake wallet confirmations are seeded. A new database starts empty. Existing Walrus records are not migrated or rewritten.

Open `/health`. Expected configuration:

```json
{
  "privateRelationshipsEnabled": true,
  "privateRelationshipStorage": "postgres",
  "memoryWritesEnabled": false,
  "selfServiceWritesEnabled": false,
  "paymentAuthorized": false
}
```

This shows configuration and successful startup, not an ongoing guarantee of database availability. Exercise the workflow below too. If a database request fails, private operations fail closed; retrying must not use a public alias instead.

## 4. Test with Josh, without builder-assisted registration

1. Payer opens **Saved recipients**, signs in with their Sui wallet, creates a contact and copies its invitation. They send the link themselves through an existing trusted conversation.
2. Josh opens the invitation on the same canonical site, signs in using his intended receiving wallet, reviews the private record and signs the receiving confirmation. No payment or onchain transaction is requested.
3. Josh shares the code and complete receiving address through that trusted conversation. The payer refreshes, checks both, chooses the actual channel and accepts.
4. Payer chooses **Use in address check** and checks the intended address. A match must describe private relationship evidence, never claim that it was a Walrus publication or identity proof.
5. Payer checks a deliberately changed address. Veyra must warn about the difference and still require independent review; it must never authorize payment.
6. Restart/redeploy the Render service. Sign in again if the session expired; the saved contact must still exist.
7. Use another wallet/browser to confirm another person cannot see the contact. Check owner export and deletion with a clearly disposable test contact.

This is the hosted acceptance step still required after configuration. Do not report Josh's test, real wallet signing or restart persistence as successful until actually observed. The builder does not perform each person's sign-in or registration.

## 5. Free-tier operation and troubleshooting

- Render Free may sleep; the first request can wait while it wakes. Neon also scales idle compute down. Do not add artificial keep-alive traffic to evade free-tier limits.
- Veyra uses at most three database connections per process and releases idle connections after ten seconds. Private transactions serialize through a transaction-scoped PostgreSQL advisory lock. This suits an initial limited test; it is not a claim of capacity for millions of users.
- If Neon reaches a free allowance, private operations may be unavailable. No paid fallback or upgrade is implemented. Monitor usage in the provider dashboard and avoid repeated load tests.
- Invalid URL/unsupported SSL option: copy the raw Neon URL again. Do not disable certificate validation.
- Initialization failed: check the raw URL, database/role, role permissions and provider availability privately. Do not post the URL or full secret-containing logs. Startup errors omit credentials.
- Feature still disabled: check the exact deployed commit, both activation/review flags, `DATABASE_URL`, and canonical origin; ensure `VEYRA_RELATIONSHIP_DB` is absent.
- If a secret is accidentally shared, rotate the database role password in Neon and update Render's private value.

Private contacts can be tested without public Walrus publication. Public writes remain locked until supported exact-ID payload verification/discovery, signed publication consent, durable publication quotas/idempotency/receipts, spending controls and genuine hosted write/read acceptance are complete. This PostgreSQL integration covers the relationship/session store; the separate publication ledger remains SQLite/local-only and must be integrated with durable hosted storage before public writes.

## References

- Neon connection guide: https://neon.com/docs/get-started/connect-neon
- Neon free-plan quotas: https://neon.com/docs/introduction/plans
- Render environment variables: https://render.com/docs/configure-environment-variables
- Render free-service behavior: https://render.com/docs/free
- node-postgres TLS: https://node-postgres.com/features/ssl
