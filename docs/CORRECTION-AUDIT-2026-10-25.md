# Navigation, evidence and closeout audit — 25 October 2026

Scope: M5 presentation/accessibility corrections and M6 release validation under the integrated product contract. No new payment feature, recipient-publication permission or Mainnet memory write is introduced.

## Corrections

- All six application pages now use the same desktop viewport containment: fixed sidebar, separate scrollable workspace and sticky workspace header. The sidebar can scroll independently on a short display so links remain reachable; scrolling the body does not move it.
- Preflight and its private-contact pages inherited a mobile `display:none` sidebar and hidden menu button. Explicit mobile overrides restore the branded header, visible Menu button, collapsed dropdown, outside-click dismissal, Escape dismissal and focus return. The bottom navigation remains available.
- Mobile workspaces return to normal document scrolling, preventing desktop viewport rules from trapping or duplicating scrolling. Long evidence fields wrap and align consistently.
- Removed decorative emoji from all shipped web pages. Existing monochrome geometric navigation indicators and the CSS appearance dot remain.
- Preflight evidence is separated into record type, recording provenance, date, validity, supporting-source action and optional storage reference. Timeline source URLs use descriptive links, rather than displaying entire URLs. Only credential-free HTTPS references become external links; other references remain escaped notes.
- Build-story resource links now explain the destination and purpose. External incident research is distinguished from Veyra's own receipt and inventory evidence.
- Added the August 2023 USDT incident and peer-reviewed poisoning/likely-typo measurements, preserving freeze/recovery outcomes and research classification limits. No causal assertion that victims lacked memory storage, no prevention guarantee, and no invented Sui incidents.
- Rewrote README around the working journeys, accurate configuration, architecture, evidence, safety boundaries, cost limits and submission state. Added a source-controlled SVG banner in the settled product palette.

## Code and security review

Reviewed the shared API entry point and routes, saved-assessment API/state machine, private relationship HTTP boundaries, PostgreSQL/SQLite driver, unified evidence interpretation, public evidence rendering, history and browser scripts. Existing protections remain: exact origin/CSRF checks, server-issued assessment tickets, record-bound consent, current browser capability checks, durable quotas/idempotency, credential rotation, verified PostgreSQL TLS and separate disabled signed recipient publication. No backend authorization defect requiring a change was established by this pass. This is a focused code/dependency/automated-test review, not an independent penetration-test certification.

Dynamic HTML evidence was already escaped. The new link renderer additionally rejects executable schemes and credential-bearing URLs. Regression coverage tests malicious notes/URLs and parses inline scripts on all seven pages, including the two private pages previously omitted from that parser check.

Known operational bounds remain explicit: shared service quotas, provider availability, storage leases, non-exhaustive semantic recall, the provider-acceptance crash reconciliation window, and credential-gated independent SEAL decryption. No speculative rewrite or paid dependency was added. Anonymous saved assessments never enter recipient baselines.

## Verification

- TypeScript passed; local tests passed 161/161 (SQLite/crypto/HTTP; PostgreSQL runs in CI).
- All seven HTML pages have unique IDs and valid inline JavaScript; README local links resolve.
- Production dependency audit returned zero known advisories at this checkpoint. This does not prove absence of vulnerabilities.
- CI PostgreSQL and hosted/browser verification are recorded in the release result after publication.
- Physical phone, extension-wallet cancellation/account switching and interactive cross-device recovery remain separately tracked manual acceptance. A desktop screenshot does not establish those passes.

## Official rules cross-check

Source: [official Total Recall event rules](https://thewalrussessions.wal.app/tatum-total-recall), rechecked 25 October 2026.

| Requirement | Veyra evidence/status |
|---|---|
| Mainnet Walrus Memory writing | Genuine consented self-service assessment job/blob receipt captured. |
| At least ten Mainnet memories | Ten unique active metadata entries captured; SDK checks/package observations disclosed. Qualification remains the organizers' decision. |
| Relevant Tatum usage | Genuine Sui Mainnet transaction observations and hosted acceptance. |
| Published blog explaining product, integrations and change through memory | Published build story, with expanded sourced problem analysis in this correction. |
| Working demo and public repository | Hosted product and public main branch. |
| Two-to-three-minute video and submission form | Recording plan/copy ready; actual video and final submission still pending. |
| Tatum AI Builder | Optional dedicated bonus; not claimed as primary platform. |

Recommended track remains Consumer Finance Apps. The rubric is 30% integrations, 30% technical quality, 20% creativity and 20% presentation. The remaining submission work is evidence-led demonstration and packaging, not more features. Deadline: 10 November 2026, 17:00 UTC / 18:00 WAT. Neither this audit nor automated tests guarantees a prize.
