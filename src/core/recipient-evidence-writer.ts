import { acceptedMemoryJob, completedMemoryJob, failedMemoryJob, type MemoryWriteState } from "./memory-write-state.ts";
import { prepareRecipientEvidenceEvent, type RecipientEvidenceEventInput } from "./recipient-evidence-event.ts";
import type { WalrusMemoryWriter } from "./recipient-memory-writer.ts";

export type EvidenceWriteResult = {
  state: MemoryWriteState;
  recordType: "veyra.recipient_evidence.v1";
  paymentAuthorized: false;
};

/** Local, explicitly consented real MemWal write. Never equate acceptance with storage. */
export async function writeRecipientEvidenceEvent(
  input: RecipientEvidenceEventInput,
  writer: WalrusMemoryWriter,
  options: { writesEnabled: boolean },
): Promise<EvidenceWriteResult> {
  const record = prepareRecipientEvidenceEvent(input);
  const result = (state: MemoryWriteState): EvidenceWriteResult => ({
    state, recordType: "veyra.recipient_evidence.v1", paymentAuthorized: false,
  });
  if (!options.writesEnabled) return result({ status: "not_attempted" });
  let state: MemoryWriteState = { status: "not_attempted" };
  try {
    state = acceptedMemoryJob(await writer.remember(JSON.stringify(record)));
    if (state.status !== "pending") return result(state);
    state = completedMemoryJob(state, await writer.waitForRememberJob(state.jobId));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Walrus memory write failed";
    state = state.status === "pending"
      ? failedMemoryJob(state, reason)
      : { status: "failed", reason };
  }
  return result(state);
}
