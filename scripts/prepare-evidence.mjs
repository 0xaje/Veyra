// Offline-only preparation of a real, operator-supplied evidence observation.
// Does not read credentials, contact a provider, or submit any memory write.
// Usage: node --experimental-strip-types scripts/prepare-evidence.mjs path/to/observation.json
import { readFile } from "node:fs/promises";
import { prepareRecipientEvidenceEvent } from "../src/core/recipient-evidence-event.ts";

const path = process.argv[2];
if (!path || process.argv.length !== 3) {
  console.error("Usage: node --experimental-strip-types scripts/prepare-evidence.mjs <observation.json>");
  process.exit(2);
}
try {
  const input = JSON.parse(await readFile(path, "utf8"));
  // Preparation uses a local-only approval marker for validation. Never sends it to a server.
  // This script cannot write, regardless of what the source JSON contains.
  const record = prepareRecipientEvidenceEvent({ ...input, userApprovedStorage: true });
  console.log(JSON.stringify({
    status: "prepared_not_stored",
    record,
    nextStep: "Manually inspect the actual source, timestamp, address kind and record. Storage requires a separate, explicit local POST with userApprovedStorage:true and confirmWrite:STORE.",
    paymentAuthorized: false
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "preparation_failed", error: error instanceof Error ? error.message : "Invalid evidence", paymentAuthorized: false }));
  process.exitCode = 1;
}
