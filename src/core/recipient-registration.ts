import { normalizeSuiAddress, type RecipientRecord } from "./recipient-check.ts";

export type RecipientRegistrationInput = {
  chain: "sui";
  network: "mainnet";
  counterpartyId: string;
  address: string;
  confirmation: {
    method: "independent_contact" | "in_person" | "signed_message";
    confirmedAt: string;
    reference: string;
  };
  userApprovedStorage: boolean;
};

export type RecipientRegistration = {
  status: "ready_for_storage";
  record: RecipientRecord;
  storage: "not_attempted";
  trust: "user_confirmed_claim";
};

/**
 * Validate an explicitly approved recipient record. This is NOT proof of
 * address ownership, nor does it perform a Walrus write.
 */
export function prepareRecipientRegistration(input: RecipientRegistrationInput): RecipientRegistration {
  if (!input.userApprovedStorage) {
    throw new Error("Explicit user approval is required before storing recipient information");
  }
  if (input.chain !== "sui" || input.network !== "mainnet") {
    throw new Error("Only Sui Mainnet recipient records are supported");
  }
  const counterpartyId = input.counterpartyId.trim();
  if (!counterpartyId || counterpartyId.length > 128) {
    throw new Error("Counterparty ID must contain 1–128 characters");
  }
  const { method, confirmedAt, reference } = input.confirmation;
  if (!["independent_contact", "in_person", "signed_message"].includes(method)) {
    throw new Error("An accepted independent confirmation method is required");
  }
  const timestamp = Date.parse(confirmedAt);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== confirmedAt ||
      timestamp > Date.now()) {
    throw new Error("Confirmation timestamp must be a valid, non-future ISO instant");
  }
  if (!reference.trim() || reference.trim().length > 256) {
    throw new Error("A confirmation reference of 1–256 characters is required");
  }
  return {
    status: "ready_for_storage",
    record: {
      chain: "sui",
      network: "mainnet",
      counterpartyId,
      address: normalizeSuiAddress(input.address),
      confirmation: { method, confirmedAt, reference: reference.trim() },
    },
    storage: "not_attempted",
    trust: "user_confirmed_claim",
  };
}
