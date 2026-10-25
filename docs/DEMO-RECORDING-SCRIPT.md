# Veyra — evidence-first submission video

Target: 2 minutes 40 seconds; absolute maximum 3 minutes. Record genuine deployed screens. Narration is approximately 300 words; rehearse the actual reading once and adjust pauses. Public recipient example and reference digest are already published in the repository. No new memory write is needed to film the existing completed receipt.

## Timed narration and screen plan

### 0:00–0:20 — the real problem

Screen: a short incident title card with source name/date/URL. Use your own text, not copied article paragraphs or an unlicensed stock image. Caption: “Ethereum incident, May 2024. Later recovery reported. Veyra currently supports Sui.”

Say: “A lookalike address can turn a familiar payment routine into a serious mistake. In May 2024, an address-poisoning incident was reported at roughly seventy-one million dollars in wrapped bitcoin. Funds were later largely recovered, but the case shows why checking only a familiar prefix and suffix is dangerous.”

### 0:20–0:35 — introduce Veyra

Screen: deployed home page, with the ordinary checker first. No wallet sign-in.

Say: “Veyra helps people check a Sui receiving address before sending. It compares the complete address with available recipient evidence and explains what matches, what differs, and what is unknown. It never executes or authorizes a payment.”

### 0:35–1:05 — memory changes the finding

Screen: use the existing Recipient Match example, then the Lookalike Address example. Caption the second as “Controlled address alteration — no transfer.” Show real responses, including missing/conflicting evidence if those cases are actually run; do not fabricate them for this recording.

Say: “Here, Walrus recalls a previously recorded receiving-address claim. The full address matches. Now I change the proposed destination. Veyra warns that it differs from the remembered evidence. This is a controlled read-only test, not a real attack. A match still requires independent confirmation; missing evidence never means safe.”

### 1:05–1:50 — user-controlled saving and return

Screen: show Save this check, expand its exact record/hash and disclosure. You may cancel this review and then navigate to the real previously completed saved assessment. Label that transition “Previously completed save — 25 October”; do not imply a different check's receipt belongs to the current one. Show the genuine existing blob, use Recall from Walrus, close the tab and reopen history.

Say: “Anyone can check without signing in. To remember an assessment, they choose Save this check, review what will be stored, and consent. Here is a genuine completed save from our hosted acceptance check. It has a Walrus blob and record hash. Recall returned the same blob with matching bytes through the Walrus Memory service. After closing the tab and returning, the saved assessment is still here. A private recovery code supports moving access to another browser.”

### 1:50–2:15 — Tatum's contribution

Screen: open Advanced options on a real public check and use the historical digest below. Show Tatum provider-observed results. If provider latency requires an edit, label the cut “Provider wait shortened”; retain actual inputs/results. Do not portray this historical transaction as a payment to the friend.

Say: “Tatum supplies real Sui Mainnet transaction observations when a transaction reference is provided. That gives historical context, not proof that the intended person owns an address. Walrus remembers the evidence and saved assessments; Tatum supplies the chain observations.”

### 2:15–2:40 — proof and close

Screen: brief evidence page or repo links; end with product and repo URLs. Show “191 tests; 6 hosted checks; 10 indexed Mainnet blobs — purposes disclosed.”

Say: “The release passed one hundred and ninety-one automated tests, including PostgreSQL persistence, and six hosted integration checks. Our inventory lists ten active Mainnet memories, with their purposes documented. Veyra keeps recipient claims, private confirmations and saved assessments distinct. It helps users understand the evidence before they decide to send.”

## Recording inputs

- Product: https://veyra-rs1l.onrender.com/
- Recipient ID: `friend-1-sui-recipient`.
- Existing published receiving-address claim: `0x53059ac6228be6b4a5a67c3f72aa174b6f20363ee11d1bd301c6b3f7ef6bfe7f`.
- Controlled changed address: `0x53059ac6228be6b4a5a67c3f72aa174b6f20363ee11d1bd301c6b3f7ef6bfe7e`.
- Historical transaction: `5BfxtP2UZbDMJAwm4bNjGvJuiP3fZW9QKghuwoYa7Nst`.
- Existing completed assessment blob: `kHbA42YBtKJ7V4LtqbWuU6S5tTqsIZ4RxVtwTvO60QI`.
- Evidence sources: TECHNICAL-BLOG.md, INTEGRATION-EVIDENCE.md and evidence/2026-10-25-saved-assessment-acceptance.json.

## Capture discipline

Use a free recorder such as the computer's existing screen recorder or OBS from its official source. Do not install or subscribe to paid tools for this. Use a clean browser view and readable zoom; hide private contacts, extension account details, cookies, recovery codes and environment settings. Keep product addresses visible only for the already-public example above. Do not include Josh's private confirmation codes.

An existing real receipt is preferable to creating filler memories for another take. If recording a genuinely new save, independently review its exact record and consent; wait for actual completion. Do not replace pending/failed states with edited success. No payment is required.

The final video itself is NOT created by this script. Record/export the actual 2–3 minute video, view it once, verify audio and links, and then provide its public viewing URL for submission.
