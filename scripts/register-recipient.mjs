// Veyra recipient registration CLI. Dry-run by default; no credentials required
// until an explicit, separately confirmed live write.
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { prepareRecipientRegistration } from "../src/core/recipient-registration.ts";
import { registerRecipientWithWalrus } from "../src/core/recipient-memory-writer.ts";

const file = process.argv[2];
const live = process.argv.includes("--live");
if (!file || file.startsWith("--")) {
  console.error("Usage: node --experimental-strip-types scripts/register-recipient.mjs <private-input.json> [--live]");
  process.exit(2);
}
let input;
try {
  input = JSON.parse(await readFile(file, "utf8"));
  const prepared = prepareRecipientRegistration(input);
  console.log(JSON.stringify({
    status: "validated",
    mode: live ? "live_requested" : "dry_run",
    counterpartyId: prepared.record.counterpartyId,
    chain: prepared.record.chain,
    network: prepared.record.network,
    storage: "not_attempted",
    warning: "User confirmation is a claim, not independent proof of recipient ownership.",
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "invalid_registration", reason: error.message }));
  process.exit(1);
}
if (!live) {
  console.log("Dry run complete. No network call and no memory write.");
  process.exit(0);
}
const serverUrl = process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz";
if (new URL(serverUrl).protocol !== "https:") {
  console.error("Live writes require an HTTPS relayer URL");
  process.exit(2);
}
const response = await fetch(new URL("/health", serverUrl), { signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error(`Relayer health HTTP ${response.status}`);
const health = await response.json();
if (health.write_ready !== true || !["ok", "healthy"].includes(health.writes)) {
  console.log(JSON.stringify({
    status: "not_attempted",
    reason: "Relayer does not report ready and operational writes; live registration is blocked.",
    writeReady: health.write_ready,
    writes: health.writes,
  }, null, 2));
  process.exit(0);
}
const rl = createInterface({ input: stdin, output: stdout });
let answer;
try {
  answer = await rl.question("This will send the approved recipient record to Walrus Mainnet. Type STORE to proceed: ");
} finally {
  rl.close();
}
if (answer !== "STORE") {
  console.log("Cancelled. No memory write attempted.");
  process.exit(0);
}
const key = process.env.MEMWAL_PRIVATE_KEY;
const accountId = process.env.MEMWAL_ACCOUNT_ID;
if (!key || !accountId) {
  console.error("Missing private Walrus credentials. No memory write attempted.");
  process.exit(2);
}
const { MemWal } = await import("@mysten-incubation/memwal");
const writer = MemWal.create({
  key, accountId, serverUrl, namespace: process.env.MEMWAL_NAMESPACE || "veyra-dev",
});
const result = await registerRecipientWithWalrus(input, writer, {
  writesEnabled: true,
  onState: (state) => console.log(JSON.stringify({ writeState: state })),
});
console.log(JSON.stringify(result, null, 2));
if (result.state.status !== "stored") process.exitCode = 1;
