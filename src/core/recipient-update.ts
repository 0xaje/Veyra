import { normalizeSuiAddress, type RecipientRecord } from "./recipient-check.ts";

export type PreviousRecipientClaim = { blobId: string; record: RecipientRecord };
export type RecipientUpdateRequest = {
  memoryIntent?: "new" | "update";
  confirmedAddressChange?: boolean;
  previousAddress?: string;
  previousBlobId?: string;
};

/**
 * Validate an update against genuine recalled evidence before creating a writer.
 * A matching recalled claim is NOT proof of recipient ownership.
 * No memory is written or superseded here.
 */
export async function validateRecipientUpdate(
  input: RecipientUpdateRequest,
  newRecord: RecipientRecord,
  recallPrevious: (counterpartyId: string) => Promise<{
    status: string;
    records: PreviousRecipientClaim[];
  }>,
): Promise<{ status: "new" | "update_checked"; priorBlobId?: string }> {
  if (input.memoryIntent === undefined || input.memoryIntent === "new") return { status: "new" };
  if (input.memoryIntent !== "update") throw new Error("Invalid recipient memory intent");
  if (input.confirmedAddressChange !== true ||
      typeof input.previousAddress !== "string" ||
      typeof input.previousBlobId !== "string" || !input.previousBlobId.trim()) {
    throw new Error("Updating a recipient requires explicit change confirmation, prior address, and prior Walrus blob ID");
  }
  const oldAddress = normalizeSuiAddress(input.previousAddress);
  if (oldAddress === normalizeSuiAddress(newRecord.address))
    throw new Error("The new address must differ from the previous address");
  const prior = await recallPrevious(newRecord.counterpartyId);
  if (prior.status !== "observed")
    throw new Error("Previous recipient memory could not be checked; no update was stored");
  const found = prior.records.some(item => {
    if (item.blobId !== input.previousBlobId ||
        item.record?.counterpartyId !== newRecord.counterpartyId ||
        item.record.chain !== "sui" || item.record.network !== "mainnet") return false;
    try { return normalizeSuiAddress(item.record.address) === oldAddress; }
    catch { return false; }
  });
  if (!found) throw new Error("Previous Walrus record not found in recall results; no update was stored");
  return { status: "update_checked", priorBlobId: input.previousBlobId };
}
