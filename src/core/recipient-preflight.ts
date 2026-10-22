import { createHash, timingSafeEqual } from "node:crypto";
import { normalizeSuiAddress, type RecipientRecord } from "./recipient-check.ts";

export type RecalledRecipient = { blobId: string; record: RecipientRecord };
export type RecipientAuthorization = {
  blobId: string;
  recordSha256: string;
  authorizedAt: string;
};
export type RecipientPreflight = {
  verdict: "review_required" | "recipient_mismatch" | "match_authorized_record";
  proposedAddress: string;
  rememberedAddress: string | null;
  memoryBlobId: string | null;
  reasons: string[];
};

/** A local authorization binds an exact memory blob and exact canonical record. */
export function fingerprintRecipient(record: RecipientRecord): string {
  return createHash("sha256").update(JSON.stringify({
    chain: record.chain, network: record.network,
    counterpartyId: record.counterpartyId,
    address: normalizeSuiAddress(record.address),
    confirmation: {
      method: record.confirmation.method,
      confirmedAt: record.confirmation.confirmedAt,
      reference: record.confirmation.reference,
    },
  })).digest("hex");
}

export function preflightRememberedRecipient(input: {
  counterpartyId: string;
  proposedAddress: string;
  recalled: RecalledRecipient[];
  authorizations: RecipientAuthorization[];
}): RecipientPreflight {
  const proposedAddress = normalizeSuiAddress(input.proposedAddress);
  const base = { proposedAddress, rememberedAddress: null, memoryBlobId: null };
  const matches = input.recalled.filter(({ record }) =>
    record.counterpartyId === input.counterpartyId &&
    record.chain === "sui" && record.network === "mainnet");
  if (matches.length !== 1) return {
    ...base, verdict: "review_required",
    reasons: [matches.length === 0
      ? "No matching recipient memory was retrieved. Search results may be incomplete."
      : "Multiple recipient memories were retrieved; resolve their history before payment."],
  };
  const candidate = matches[0];
  const rememberedAddress = normalizeSuiAddress(candidate.record.address);
  const fingerprint = fingerprintRecipient(candidate.record);
  const authorized = input.authorizations.some((auth) => {
    if (auth.blobId !== candidate.blobId ||
        !Number.isFinite(Date.parse(auth.authorizedAt)) ||
        Date.parse(auth.authorizedAt) > Date.now() ||
        !/^[a-f0-9]{64}$/.test(auth.recordSha256)) return false;
    return timingSafeEqual(Buffer.from(auth.recordSha256, "hex"), Buffer.from(fingerprint, "hex"));
  });
  if (!authorized) return {
    verdict: "review_required", proposedAddress, rememberedAddress,
    memoryBlobId: candidate.blobId,
    reasons: ["Walrus memory has not been matched to a locally authorized exact record. Independently confirm recipient ownership."],
  };
  if (proposedAddress !== rememberedAddress) return {
    verdict: "recipient_mismatch", proposedAddress, rememberedAddress,
    memoryBlobId: candidate.blobId,
    reasons: ["Proposed destination differs from the locally authorized remembered address. Stop and independently verify the change."],
  };
  return {
    verdict: "match_authorized_record", proposedAddress, rememberedAddress,
    memoryBlobId: candidate.blobId,
    reasons: ["Destination matches a locally authorized remembered record; this does not establish ownership, current authorization, or safety."],
  };
}
