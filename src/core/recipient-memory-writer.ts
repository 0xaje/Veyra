import {
  acceptedMemoryJob, completedMemoryJob, failedMemoryJob,
  type MemoryWriteState,
} from "./memory-write-state.ts";
import {
  prepareRecipientRegistration,
  type RecipientRegistrationInput,
} from "./recipient-registration.ts";

export type WalrusMemoryWriter = {
  remember(content: string): Promise<{ job_id?: unknown }>;
  waitForRememberJob(jobId: string): Promise<{ blob_id?: unknown }>;
};

export type RegistrationWriteResult = {
  state: MemoryWriteState;
  recordType: "veyra.recipient.v1";
  warning: string;
};

const WARNING = "A user-confirmed claim is not independent proof of address ownership or recipient safety.";

/**
 * Use with an authenticated real MemWal SDK instance. No fake persistence or
 * silent fallback. Callers must explicitly enable writes after checking service
 * health and obtaining the user's informed storage approval.
 */
export async function registerRecipientWithWalrus(
  input: RecipientRegistrationInput,
  writer: WalrusMemoryWriter,
  options: { writesEnabled: boolean; onState?: (state: MemoryWriteState) => void },
): Promise<RegistrationWriteResult> {
  const registration = prepareRecipientRegistration(input);
  if (!options.writesEnabled) {
    const state: MemoryWriteState = { status: "not_attempted" };
    options.onState?.(state);
    return { state, recordType: "veyra.recipient.v1", warning: WARNING };
  }

  const payload = JSON.stringify({
    type: "veyra.recipient.v1",
    ...registration.record,
  });

  let state: MemoryWriteState = { status: "not_attempted" };
  try {
    state = acceptedMemoryJob(await writer.remember(payload));
    options.onState?.(state);
    if (state.status !== "pending") {
      return { state, recordType: "veyra.recipient.v1", warning: WARNING };
    }
    const completed = await writer.waitForRememberJob(state.jobId);
    state = completedMemoryJob(state, completed);
    options.onState?.(state);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown memory service failure";
    state = state.status === "pending"
      ? failedMemoryJob(state, reason)
      : { status: "failed", reason };
    options.onState?.(state);
  }
  return { state, recordType: "veyra.recipient.v1", warning: WARNING };
}
