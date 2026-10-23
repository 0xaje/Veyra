// Non-secret application verification receipt, prepared only after a successful Sui challenge.
// This module does not upload to Walrus or authorize any payment.
import { randomUUID } from "node:crypto";
import { normalizeSuiAddress } from "./recipient-check.ts";

export type VerifiedWalletControlResult = {
  status: "wallet_control_verified";
  address: string;
  verifiedAt: string;
  proof: "valid_sui_personal_message_signature";
  independentlyVerified: true;
  identityVerified: false;
  recipientSafe: false;
  paymentAuthorized: false;
};

export function prepareWalletControlReceipt(result: VerifiedWalletControlResult, receiptId = randomUUID()) {
  if (!result || result.status !== "wallet_control_verified" ||
      result.proof !== "valid_sui_personal_message_signature" ||
      result.independentlyVerified !== true || result.identityVerified !== false ||
      result.recipientSafe !== false || result.paymentAuthorized !== false)
    throw new Error("A successful verified wallet-control result is required");
  const address = normalizeSuiAddress(result.address);
  const time = Date.parse(result.verifiedAt);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== result.verifiedAt ||
      time > Date.now() || time < Date.now() - 10 * 60_000)
    throw new Error("Verification result is not recent");
  if (typeof receiptId !== "string" || !/^[0-9a-f-]{36}$/.test(receiptId))
    throw new Error("Invalid receipt identifier");
  return {
    type: "veyra.wallet_control_observation.v1" as const,
    chain: "sui" as const,
    network: "mainnet" as const,
    address,
    verifiedAt: result.verifiedAt,
    receiptId,
    verificationMethod: "sui:signPersonalMessage" as const,
    evidence: "application_verified_single_use_challenge" as const,
    identityVerified: false as const,
    recipientSafe: false as const,
    paymentAuthorized: false as const,
    storageStatus: "prepared_not_stored" as const,
    limitation: "Application verification of signing-key control at a point in time; not recipient identity or safety.",
  };
}
