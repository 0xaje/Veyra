# Veyra — news opening and complete product journey

Production brief and laptop recording guide. Prepared 25 October 2026 against deployed product revision `df63262`. This replaces the earlier single-incident 2:40 outline. Target final duration: **2:55**, within the official **2–3 minute** requirement. The video has not yet been recorded or rendered.

## Creative direction

Open with a 22-second historical news recap using three real evidence sources, then show one complete consumer journey. Use original motion graphics inspired by a news bulletin: source capture, incident date, concise factual caption, restrained transition. Credit the source on every card. Label it **“Reported incidents / historical recap”**, so past events are not presented as breaking today.

Use Veyra's settled cream/charcoal treatment, readable white/ink text and restrained status colour. No emojis, invented victim photographs, generated transaction screenshots or copied broadcaster branding. A reference video can guide pacing; create our own opening graphics and audio.

## The three intro references

These are three evidence sources, not three named victims. Use actual article/research headline captures when obtainable. If a page blocks capture, create a clearly authored fact card with its source/date; do not manufacture a newspaper screenshot. Do not use generic stock photographs as incident evidence. Keep screenshots to a headline/date/source crop with minimal article text. Confirm permitted image use before republishing third-party illustrations; attribution alone is not a licence.

| Asset | Fact card | What the capture should show | Source and distinction |
|---|---|---|---|
| `01-wbtc-source.png` | May 2024 · Lookalike address · Approximately $71m WBTC · Funds later returned | Genuine investigation headline and publisher/date. An accompanying original caption carries the incident amount and recovery context. | [Chainalysis investigation](https://www.chainalysis.com/blog/address-poisoning-scam/) published 23 October 2024; incident 3 May 2024. Initial valuation about $68m; widely reported around $71m. [Recovery reporting](https://www.theblock.co/news/ecosystems/2024-05-11-victim-of-71-million-address-poisoning-attack-recovers-funds-following-negotiations-293908). |
| `02-usdt-source.png` | 1 August 2023 · $20m USDT misdirected · Destination blacklisted | Genuine report headline, publisher and date. | [Crypto Briefing incident report](https://cryptobriefing.com/tether-swiftly-blacklists-phishing-address/). A freeze/intervention is reported; do not call the whole amount a permanent loss. This source was verified during research; capture availability may vary. |
| `03-research-source.png` | USENIX Security 2025 · 6,633 successful poisoning transfers · At least $83.8m | Actual research title and authors/source. Put the statistical summary in an original caption. | [Blockchain Address Poisoning](https://www.usenix.org/conference/usenixsecurity25/presentation/tsuchiya). Ethereum/BSC measurements July 2022–June 2024. This is a study, not another single incident. Its stablecoin loss measurement excludes the WBTC incident. |

Use the news headline/date as visual evidence; do not read article paragraphs aloud. The incidents concern other chains; the product demonstration is Sui Mainnet. The sources do not establish that victims lacked memory software or prove Veyra would have prevented those cases. Do not add the amounts together into a new loss total.

## Final edit timeline and exact voiceover

Read naturally at roughly 125–135 words/minute and rehearse against the footage. There is room for pauses in the 2:55 edit. On-screen text should support the voice rather than reproduce every sentence.

### 00:00–00:22 — historical news recap

Picture: three cards, approximately 8 / 7 / 7 seconds. Dates and source credits stay visible; recovery/freeze context appears on the corresponding card. Source URLs can sit in the video description; short publisher credits belong on screen.

Voiceover:

> A lookalike address. Millions sent to the wrong destination. In May 2024, a WBTC incident was reported at around seventy-one million dollars; funds were later returned. Another USDT case prompted an emergency freeze. Research documents thousands of successful poisoning transfers. The destination matters.

### 00:22–00:34 — introduce Veyra

Picture: genuine deployed checker, recipient form and Findings panel visible. Small caption: “Sui Mainnet · No sign-in required to check”.

Voiceover:

> This is Veyra. It helps people check a Sui receiving address before sending, using remembered recipient evidence and real blockchain observations.

### 00:34–00:59 — recalled memory changes the finding

Picture: click Recipient Match; retain actual loading and successful result in the raw take. Show the complete-address match headline, then View evidence and details, recipient observation, recorded date and Storage reference. Briefly highlight the real existing friend blob; no reconstructed results.

Voiceover:

> I enter a recipient and destination. Walrus recalls an earlier receiving-address claim, and Veyra compares the complete address. Here, it matches the remembered record. I can inspect its source, date and storage reference. Independent recipient confirmation is still required.

### 00:59–01:16 — changed destination warning

Picture: click Lookalike Address. Show the actual difference warning and next steps. Overlay: “Controlled one-character change · No transfer”.

Voiceover:

> Now I change one character. The proposed destination differs from the remembered address, and Veyra flags it for review. This is a controlled check; no funds move. Missing evidence also never means safe.

### 01:16–01:34 — Tatum's concrete contribution

Picture: restore the original matching address, expand Advanced options, paste the real historical digest, and run the check. Show Tatum evidence and the genuine transaction-details panel, including execution status or observed sender. Overlay: “Historical Sui transaction · Provider-observed context”.

Voiceover:

> Tatum adds real Sui Mainnet transaction observations when I provide a transaction reference. These are historical participants and transaction details. They provide context, rather than proof of the recipient's identity or current intent.

### 01:34–02:12 — anyone can save this assessment

Picture: on that final matching check, click Save this check; open View exact record and hash; show disclosure and false ownership/payment flags; explicitly consent. Retain the real submission/loading/completed receipt in the raw take. In the edit, shorten only the provider wait with a visible label. Show the completed blob/hash and click Recall from Walrus; show the matching verification message.

Voiceover:

> To remember this assessment, I choose Save this check. I review the exact record and disclosure, then consent. The record does not claim recipient ownership or authorize payment. The submission produces a genuine Walrus receipt. Recall checks the expected blob and matching record hash through the Walrus Memory service. Pending storage is shown separately from completion.

### 02:12–02:30 — persistent return

Picture: open Activity History, locate that same saved check, close the original tab, reopen `/history` in a new tab in the same browser profile, and show the same receipt. Keep the distinction between Saved to Walrus and Current browser session visible. Overlay: “New tab · Same browser · Saved receipt retained”.

Voiceover:

> I close the tab and return. My saved assessment is still available in this browser, separately from temporary session history. A private recovery code supports moving access to another browser.

### 02:30–02:42 — optional private receiving workflow

Picture: briefly show the Saved recipients entry and optional sign-in explanation; no private names, invitation codes or wallet account details. If useful footage is unavailable, use this time for the real saved-receipt return; do not fabricate an authenticated journey.

Voiceover:

> People can also choose private recipient confirmations. That optional wallet-authenticated workflow stays separate from the ordinary public address check.

### 02:42–02:55 — evidence and close

Picture: actual Memory & Records inventory count; quick glimpse of published build story and public repo/CI evidence. End card: product URL, repo URL, “Check the destination. Remember the evidence.” Only show test/count claims supported by the captured revision.

Voiceover:

> The Mainnet inventory, integration evidence and automated checks are documented publicly. Walrus supplies memory. Tatum supplies chain observations. Veyra helps people review the evidence before they decide to send.

## Before recording on the laptop

1. Open the deployed [product](https://veyra-rs1l.onrender.com/). Use the browser/profile in which you want the saved assessment to remain available.
2. Hide notifications, unrelated tabs, bookmarks with private information, password-manager suggestions and wallet account details. Do not record Render/Neon settings, API keys, environment files, private invitations or recovery codes.
3. Record in landscape at 1920×1080 if the laptop supports it, at 30 fps, with readable browser zoom. Keep one theme throughout the main journey. Capture a short second-theme clip only if it contributes clearly.
4. Open the source references and public repository in separate prepared tabs. Gather the three real headline/date crops above. Keep the original full captures privately as provenance and use restrained crops in the edit.
5. Verify the matching example, controlled mismatch and historical digest once before the main take. Provider timeouts/rate limits are real possibilities; rehearse without repeatedly submitting memory writes.
6. Check Activity History for access. The previously verified agent-browser receipt will not automatically appear on the laptop. Either restore access privately through the product using a recovery code from its original browser, or record **one genuinely reviewed new save on the laptop**. Do not paste recovery credentials into chat or the editor's asset folder.
7. If using a new save, its final record/hash/blob will differ from the historical acceptance receipt. Use the new receipt consistently throughout that recording. Check existing service allowance before committing; do not assume availability.
8. Capture raw takes with a second of stillness at their beginning and end. Record voiceover separately after the footage timing is settled; use your own voice or an already available no-cost voice workflow.

## Laptop recording steps — record these clips in order

### Clip 04 — product opening and existing memory match

1. Start at `/` with the checker visible and no private contact selected.
2. Click **Recipient Match**. The existing button fills the published friend identifier/address and submits a real check automatically. Do not click Check recipient a second time while it is loading.
3. Wait for the real match result; record the headline and manual-review next steps.
4. Open **View evidence and details**. Scroll to **Memory record**, showing the recipient observation, source note, recorded time and **Storage reference**.
5. Leave the original address visible long enough to establish that this is full-address comparison. No recipient name/address is invented for the footage.

### Clip 05 — one-character mismatch

1. Click **Lookalike Address**. It submits the controlled published changed address automatically.
2. Wait for the real response and record the differing-address warning.
3. Keep the “controlled change / no transfer” caption attached to this clip.

### Clip 06 — real Tatum evidence and final matching check

1. Restore the original address in the form. You can edit the address field directly to avoid an unnecessary intermediate request.
2. Expand **Advanced options** and paste the historical digest listed below.
3. Click **Run recipient assessment** / **Check recipient** once; the button wording depends on whether a previous check ran.
4. Wait for the actual response. Open **View evidence and details** and record **Tatum evidence** and **Transaction details**. This transaction is unrelated historical context, not proof of a payment to the friend.
5. Keep this assessment unchanged for the save clip. Editing inputs or running another check resets the active save review.

### Clip 07 — exact review, intentional save and recall

1. Click **Save this check** beneath the completed finding.
2. Open **View exact record and hash**. Capture the real record, hash and disclosure. Show that `recipientConfirmed`, `identityVerified` and `paymentAuthorized` are false.
3. Independently review the address/content. If you intentionally want that assessment stored, tick **I agree to save this exact assessment to Walrus**, then click **Confirm save to Walrus** once.
4. Keep recording through the genuine pending state. Wait for **Stored on Walrus** and the actual blob/hash. Use **Check storage status** on the same job if needed. Do not create another save to bypass a timeout or uncertain result.
5. Click **Recall from Walrus** and record the actual matching blob/hash message. This is relayer verification; do not label it independent ciphertext decryption.
6. If storage fails, remains uncertain, allowance is exhausted or recall does not match, retain the raw take and resolve the real issue before claiming success. Do not replace it with a rendered success state.

### Clip 08 — same saved check after a new tab

1. Click **Open saved checks** to reach Activity History. Locate the newly completed assessment by address, check time and blob/hash.
2. Close the original tab and open a fresh `/history` tab in the same normal browser profile. Do not use private/incognito mode or clear cookies.
3. Record the same saved card and storage receipt. A different empty temporary session list is expected and useful to show.
4. Keep **Get my recovery code** untouched on camera. A real second-browser recovery can be an additional acceptance recording performed privately; this short video does not claim to have demonstrated it merely by mentioning the feature.

### Clip 09 — optional receiving entry and proof

1. Capture the Saved recipients entry briefly, without revealing private data or pretending a wallet connection occurred.
2. Open `/memory`, wait for the actual inventory, and record the current count. A new genuine save may increase it beyond the previously captured ten; show what it actually says.
3. Open `/docs#build-story` and the public GitHub repository. Capture brief readable evidence links; record CI results only for a genuinely passed revision.
4. End on the product URL and repository URL.

## Public recording inputs

These examples are already public in the repository. They are evidence/test inputs, not a recommendation to transfer money.

```text
Product: https://veyra-rs1l.onrender.com/
Recipient ID: friend-1-sui-recipient
Original recorded address:
0x53059ac6228be6b4a5a67c3f72aa174b6f20363ee11d1bd301c6b3f7ef6bfe7f
Controlled changed address:
0x53059ac6228be6b4a5a67c3f72aa174b6f20363ee11d1bd301c6b3f7ef6bfe7e
Historical Sui digest:
5BfxtP2UZbDMJAwm4bNjGvJuiP3fZW9QKghuwoYa7Nst
Previously completed assessment blob (only if actually using its collection):
kHbA42YBtKJ7V4LtqbWuU6S5tTqsIZ4RxVtwTvO60QI
```

## Handoff to Antigravity / Remotion

Create an assembly project for the supplied real assets; the app is not being redesigned. Suggested asset names:

```text
01-wbtc-source.png
02-usdt-source.png
03-research-source.png
04-match.mp4
05-controlled-mismatch.mp4
06-tatum-mainnet.mp4
07-review-save-recall.mp4
08-new-tab-history.mp4
09-optional-contacts-proof.mp4
voiceover.wav
source-credits.md
```

Editor brief:

- Assemble the 2:55 timeline above from the actual recordings. Keep product interaction readable; avoid fast pans or zooms that conceal the input/result relationship.
- Create an original short news opening and closing card. Use source/date captions and historical-event labels. Avoid copied broadcaster assets, fake headlines, invented photographs, emojis and unlicensed music.
- Add the supplied narration, accurate subtitles and restrained transitions. Keep any licensed/owned music low under speech and optional. No subscription or paid render/voice service is required by this plan.
- When shortening actual provider waits, show “Provider wait shortened”. Preserve the same assessment/job through pending, completion and recall. Do not combine one check's review with a different check's receipt unless the cut explicitly identifies a previously completed save.
- Public caption counts must match the actual captured inventory. Preserve the distinction between an assessment memory, a recipient claim, a private confirmation and a historical chain observation.
- Deliver landscape H.264 MP4 with clear audio, preferably 1920×1080/30 fps, plus a subtitle file and source-credit text. Final runtime must remain between 2 and 3 minutes. Render locally with the existing Remotion workflow; Render hosts the app and is not required as a video-rendering service.
- Do not alter the application, API responses, wallet UI or receipt content to manufacture footage. No new product feature is part of this video task.

## Proof map against the official requirements

| Requirement | Visible proof in the edit | Supporting link |
|---|---|---|
| Meaningful Walrus memory use | Earlier record changes match/mismatch explanation; real save, blob/hash receipt, recall and return | [Saved-assessment acceptance](evidence/2026-10-25-saved-assessment-acceptance.json) |
| Relevant Tatum usage | Real digest input and actual Sui transaction observations | [Integration evidence](INTEGRATION-EVIDENCE.md) |
| At least ten Mainnet memories | Current genuine inventory count, with record purposes disclosed | [Captured inventory](evidence/2026-10-25-inventory-after-save.json) |
| Published technical blog | Brief real build-story view and link in description | [Published build story](https://veyra-rs1l.onrender.com/docs#build-story) |
| Working demo and public repo | Real deployed screen recording and end-card links | [Product](https://veyra-rs1l.onrender.com/) · [Repository](https://github.com/0xaje/Veyra) |
| Two-to-three-minute video | Verify exported duration and playable public link | Actual export still pending |

Source: [official event rules](https://thewalrussessions.wal.app/tatum-total-recall), rechecked 25 October 2026. The inventory count does not itself constitute an organizer eligibility ruling. Tatum AI Builder is optional for its dedicated bonus; do not claim it was the primary platform. This video does not claim payments were executed or that Veyra prevented the historical incidents.

## Final review before upload

Watch the entire export once. Confirm readable text, accurate dates/source credits, recovery/freeze context, uninterrupted input-to-result relationships, same-job receipt/recall continuity, no visible secrets/private contacts, intelligible audio and accurate subtitles. Verify runtime, product/repo/blog links and the public video's signed-out playback. Place full source references in the description, then use the approved submission copy. The final video and submission are not complete merely because this brief exists.
