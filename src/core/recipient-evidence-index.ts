import { createHash } from "node:crypto";
import { normalizeSuiAddress } from "./recipient-check.ts";

export type RecipientIndexEntry = {
  blobId: string;
  recordType: "veyra.recipient.v1" | "veyra.recipient_evidence.v1" | "veyra.wallet_control_memory.v1";
  counterpartyId: string | null;
  address: string;
  addressKind: "wallet" | "package" | "shared_object";
  payloadSha256: string;
  observedAt: string;
  storedAt: string;
  provenance: string;
  sourceReference?: string;
  rawJson: string;
};

export type RecipientIndexStore = {
  schema: "veyra.recipient_index.v1";
  updatedAt: string;
  entries: RecipientIndexEntry[];
};

export function computePayloadSha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Validates and maps a retrieved record into an indexed entry.
 * Enforces SHA-256 payload integrity and exact blob binding.
 */
export function validateAndIndexRecord(
  blobId: string,
  rawJson: string,
  storedAt = new Date().toISOString()
): RecipientIndexEntry {
  if (typeof blobId !== "string" || !blobId.trim()) {
    throw new Error("Valid blob identifier required");
  }
  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("Record payload is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Malformed record payload");
  }

  const payloadSha256 = computePayloadSha256(rawJson);

  if (parsed.type === "veyra.recipient.v1") {
    if (parsed.chain !== "sui" || parsed.network !== "mainnet") {
      throw new Error("Only Sui Mainnet records are supported");
    }
    const address = normalizeSuiAddress(parsed.address);
    const counterpartyId = typeof parsed.counterpartyId === "string" ? parsed.counterpartyId.trim() : "";
    if (!counterpartyId) throw new Error("Counterparty ID required for recipient record");

    return {
      blobId,
      recordType: "veyra.recipient.v1",
      counterpartyId,
      address,
      addressKind: "wallet",
      payloadSha256,
      observedAt: parsed.confirmation?.confirmedAt || storedAt,
      storedAt,
      provenance: "user_confirmed_claim",
      sourceReference: parsed.confirmation?.reference,
      rawJson,
    };
  }

  if (parsed.type === "veyra.recipient_evidence.v1") {
    if (parsed.chain !== "sui" || parsed.network !== "mainnet") {
      throw new Error("Only Sui Mainnet evidence records are supported");
    }
    const address = normalizeSuiAddress(parsed.address);
    const counterpartyId = typeof parsed.counterpartyId === "string" ? parsed.counterpartyId.trim() : null;
    const addressKind = parsed.addressKind;
    if (!["wallet", "package", "shared_object"].includes(addressKind)) {
      throw new Error("Valid addressKind required");
    }

    return {
      blobId,
      recordType: "veyra.recipient_evidence.v1",
      counterpartyId,
      address,
      addressKind,
      payloadSha256,
      observedAt: parsed.source?.observedAt || storedAt,
      storedAt,
      provenance: parsed.source?.kind || "informational_unverified",
      sourceReference: parsed.source?.reference,
      rawJson,
    };
  }

  if (parsed.type === "veyra.wallet_control_memory.v1") {
    if (parsed.chain !== "sui" || parsed.network !== "mainnet") {
      throw new Error("Only Sui Mainnet wallet control records are supported");
    }
    const address = normalizeSuiAddress(parsed.address);

    return {
      blobId,
      recordType: "veyra.wallet_control_memory.v1",
      counterpartyId: null,
      address,
      addressKind: "wallet",
      payloadSha256,
      observedAt: parsed.claimedVerifiedAt || storedAt,
      storedAt,
      provenance: parsed.provenance || "locally_reverified_portable_signature",
      sourceReference: parsed.verificationMethod,
      rawJson,
    };
  }

  throw new Error(`Unsupported record type: ${parsed.type}`);
}

export class RecipientEvidenceIndex {
  private entriesByBlob = new Map<string, RecipientIndexEntry>();
  private blobsByCounterparty = new Map<string, Set<string>>();
  private blobsByAddress = new Map<string, Set<string>>();

  constructor(initialEntries: RecipientIndexEntry[] = []) {
    for (const entry of initialEntries) {
      this.addEntry(entry);
    }
  }

  public addRecord(blobId: string, rawJson: string, storedAt?: string): RecipientIndexEntry {
    const entry = validateAndIndexRecord(blobId, rawJson, storedAt);
    this.addEntry(entry);
    return entry;
  }

  public addEntry(entry: RecipientIndexEntry): void {
    this.entriesByBlob.set(entry.blobId, entry);

    if (entry.counterpartyId) {
      const cId = entry.counterpartyId;
      if (!this.blobsByCounterparty.has(cId)) {
        this.blobsByCounterparty.set(cId, new Set());
      }
      this.blobsByCounterparty.get(cId)!.add(entry.blobId);
    }

    const addr = entry.address;
    if (!this.blobsByAddress.has(addr)) {
      this.blobsByAddress.set(addr, new Set());
    }
    this.blobsByAddress.get(addr)!.add(entry.blobId);
  }

  public getByBlobId(blobId: string): RecipientIndexEntry | undefined {
    return this.entriesByBlob.get(blobId);
  }

  public getByCounterparty(counterpartyId: string): RecipientIndexEntry[] {
    const blobIds = this.blobsByCounterparty.get(counterpartyId.trim());
    if (!blobIds) return [];
    return Array.from(blobIds).map(id => this.entriesByBlob.get(id)!).filter(Boolean);
  }

  public getByAddress(address: string): RecipientIndexEntry[] {
    try {
      const normalized = normalizeSuiAddress(address);
      const blobIds = this.blobsByAddress.get(normalized);
      if (!blobIds) return [];
      return Array.from(blobIds).map(id => this.entriesByBlob.get(id)!).filter(Boolean);
    } catch {
      return [];
    }
  }

  public getAllEntries(): RecipientIndexEntry[] {
    return Array.from(this.entriesByBlob.values());
  }

  public toJSON(): RecipientIndexStore {
    return {
      schema: "veyra.recipient_index.v1",
      updatedAt: new Date().toISOString(),
      entries: this.getAllEntries(),
    };
  }

  public static fromJSON(data: RecipientIndexStore): RecipientEvidenceIndex {
    if (!data || data.schema !== "veyra.recipient_index.v1" || !Array.isArray(data.entries)) {
      throw new Error("Invalid recipient index schema");
    }
    return new RecipientEvidenceIndex(data.entries);
  }
}
