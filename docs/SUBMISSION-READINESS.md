# Veyra — Total Recall submission readiness

Updated audit: October 25, 2026. Demo link added: October 27, 2026. Official rules: https://thewalrussessions.wal.app/tatum-total-recall

Deadline: November 10, 2026, 17:00 UTC / 18:00 WAT. Submission form: https://recall-tatum-walrus.vercel.app

## Status

| Requirement | Status |
|---|---|
| Genuine Walrus SDK write and recall | Verified in development |
| Walrus Mainnet provenance of each qualifying blob | Verify individually |
| At least 10 Mainnet memories | Ten unique active Mainnet blobs listed after the genuine self-service assessment save. Purposes documented, including two historical SDK checks; no organizer eligibility ruling claimed. |
| Genuine Tatum Sui Mainnet RPC | Verified; see INTEGRATION-EVIDENCE.md |
| Public GitHub and working demo | Public main and Render verified; current code CI and six hosted checks pass |
| Published technical blog | Published at https://veyra-rs1l.onrender.com/docs#build-story; deployed article visually verified in light and dark modes on 25 October 2026. Source: TECHNICAL-BLOG.md |
| 2–3 minute demo video | [Watch the uploaded demo](https://youtu.be/fZ2HohfF0RM). Final signed-out playback and audiovisual quality review remain separate checks. |
| Submission form and identifiers | Copy prepared in SUBMISSION-COPY.md; account-owner identifiers and actual submission confirmation pending |

See [the closeout audit](CLOSEOUT-AUDIT-2026-10-25.md) and [captured read-only results](evidence/2026-10-25-readonly-memory-audit.json). Private wallet signing, acceptance, match/mismatch and operator-reported restart have evidence; do not list them as entirely untested. Signed recipient-confirmation publication remains separately unfinished. Anonymous assessment saving is now live-tested: one new consented assessment was stored, recalled with matching bytes/hash through the relayer, and loaded after closing/reopening the browser tab. See SAVED-ASSESSMENTS.md and evidence/2026-10-25-saved-assessment-acceptance.json.

## Genuine memory plan

Only record meaningful, real recipient confirmations, independently verified address changes, or reconfirmations that genuinely occurred. Each write requires fresh, explicit user consent. Do not fabricate contacts, addresses, confirmations, or transactions, and do not repeatedly save identical data to pad a count.

For every candidate, record privately: event purpose, counterparty alias, confirmation method/time/reference, consent, completed Walrus job, durable blob ID, successful recall, and Mainnet provenance. Keep private confirmation details and credentials out of the public repo. Verify organizer guidance on qualifying memory types if needed.

For an address change, preserve older records, show conflicts, and require review. Never silently trust the newest claim.

## Demo narrative

1. Real remembered recipient and Walrus blob.
2. Read-only preflight against the remembered address.
3. Read-only one-character altered-address warning, without funds transfer.
4. Memory Status timeline and limitations.
5. Only if a real address change occurs, show the consented update. Otherwise label the update feature as tested, not live-demonstrated.

## Publication checklist

Publish an accurate technical blog covering product purpose, Tatum gRPC observations, Walrus memory writes and recalls, and how real historical memories influence warnings. The [demo video](https://youtu.be/fZ2HohfF0RM) is uploaded; verify signed-out playback and final presentation quality. Confirm repository visibility, Mainnet memory evidence, submission identifiers, and working demo before November 10.

Veyra never signs or authorizes payments. Walrus memory is not proof of address ownership.

## Fixed release closeout

Follow [RELEASE-ACCEPTANCE.md](RELEASE-ACCEPTANCE.md). Do not repeat every successful happy-path test or add unrelated features. Only physical-phone, real wallet cancellation/account switching, cross-device interactive recovery and final keyboard acceptance remain manual unless their actual results are recorded. The blog, script and uploaded demo link are available; the actual form submission still requires its own confirmation.
