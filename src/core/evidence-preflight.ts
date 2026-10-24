import { normalizeSuiAddress } from "./recipient-check.ts";
import { unifyRecipientEvidence, type RecalledEvidence } from "./unified-recipient-evidence.ts";
import { buildRecipientMemoryTimeline } from "./recipient-memory-timeline.ts";
import { assess, type Evidence } from "./assessment.ts";
import { preflightRememberedRecipient, type RecalledRecipient, type RecipientAuthorization } from "./recipient-preflight.ts";

export type TatumTransactionObservation = {
  status: "observed";
  provider: "tatum";
  network: "sui-mainnet";
  transport: "grpc";
  method: "LedgerService/GetTransaction";
  evidence: {
    digest: string;
    sender: string | null;
    executionStatus: string;
    balanceChanges: { address: string | null; amount: string | null; coinType: string | null }[];
  };
  checkedAt: string;
};

export function preflightWithEvidence(input: {
  counterpartyId: string;
  proposedAddress: string;
  recalled: RecalledRecipient[];
  authorizations: RecipientAuthorization[];
  evidenceEvents?: RecalledEvidence[];
  walletControlEvents?: RecalledEvidence[];
  tatumObservation?: TatumTransactionObservation | null;
}) {
  const proposedAddress = normalizeSuiAddress(input.proposedAddress);
  const unifiedEvidence = unifyRecipientEvidence({ counterpartyId: input.counterpartyId, proposedAddress, recipientClaims: input.recalled, evidenceEvents: input.evidenceEvents, walletControlEvents: input.walletControlEvents });
  const applicableClaims = input.recalled.filter(item => unifyRecipientEvidence({
    counterpartyId: input.counterpartyId, proposedAddress, recipientClaims: [item],
  }).entries.length === 1);
  const recipient = preflightRememberedRecipient({
    counterpartyId: input.counterpartyId,
    proposedAddress,
    recalled: applicableClaims,
    authorizations: input.authorizations,
  });
  // M1: compatibility projection of the SAME interpretation used by the conclusion.
  // Observations remain claims; never convert them into locally authorized records.
  const rememberedAddresses = unifiedEvidence.observedAddresses;
  const memoryComparison = {
    status: unifiedEvidence.status === "no_evidence" ? "not_found" :
      unifiedEvidence.status === "conflicting_observations" ? "conflicting_memories" :
      unifiedEvidence.status === "matches_observed_address" ? "matches_remembered_claim" : "differs_from_remembered_claim",
    rememberedAddresses,
    evidenceBlobIds: unifiedEvidence.entries.filter(e => e.recipientBaseline).map(e => e.blobId),
    basis: "unified_recipient_evidence" as const,
    retrievalCompleteness: unifiedEvidence.retrievalCompleteness,
    independentlyVerified: false,
    paymentAuthorized: false,
  };
  const memoryTimeline = buildRecipientMemoryTimeline(input.counterpartyId, applicableClaims, unifiedEvidence.entries);
  const observation = input.tatumObservation;
  const validTatum = !!observation &&
    observation.status === "observed" &&
    observation.provider === "tatum" &&
    observation.network === "sui-mainnet" &&
    observation.method === "LedgerService/GetTransaction" &&
    /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(observation.evidence?.digest ?? "") &&
    Number.isFinite(Date.parse(observation.checkedAt)) &&
    Date.parse(observation.checkedAt) <= Date.now();
  const evidence: Evidence[] = validTatum ? [{
    source: "tatum",
    reference: observation!.evidence.digest,
    observedAt: observation!.checkedAt,
    verified: false, // Provider response is not independently cryptographically verified.
  }] : [];
  const matchesProposed = (value: unknown) => {
    if (typeof value !== "string") return false;
    try { return normalizeSuiAddress(value) === proposedAddress; } catch { return false; }
  };
  const historicalAddressObserved = validTatum && (
    matchesProposed(observation?.evidence.sender) ||
    (observation?.evidence.balanceChanges ?? []).some(change =>
      matchesProposed(change.address))
  );
  const assessment = assess({
    recipient: proposedAddress, chain: "sui", network: "mainnet", evidence,
  });
  const unifiedConclusion = {
    status: unifiedEvidence.status,
    message: unifiedEvidence.status === "matches_observed_address"
      ? "The proposed address matches recalled recipient evidence. This is not proof of identity, current intent, or safety."
      : unifiedEvidence.status === "differs_from_observed_address"
      ? "The proposed address differs from recalled recipient evidence. Independently confirm the change before proceeding."
      : unifiedEvidence.status === "conflicting_observations"
      ? "Recalled recipient evidence contains different addresses. Resolve the conflict independently."
      : "No applicable recipient evidence was recalled. Search may be incomplete; independently confirm the address.",
    evidenceCount: unifiedEvidence.entries.filter(entry => entry.recipientBaseline).length,
    retrievalCompleteness: "unknown" as const,
    action: "manual_review_required" as const,
    paymentAuthorized: false as const,
  };
  return {
    status: "read_only_preflight" as const,
    conclusion: unifiedConclusion,
    recipient: {
      ...recipient,
      ...(unifiedEvidence.status === "conflicting_observations" ? {
        verdict: "review_required" as const,
        reasons: ["Unified recipient evidence conflicts; a legacy exact-record authorization cannot resolve that conflict."],
      } : {}),
      scope: "legacy_exact_record_authorization_only" as const,
      limitation: "This legacy authorization check excludes informational observations; use conclusion and unifiedEvidence for recipient comparison.",
    },
    unifiedEvidence,
    memoryComparison,
    memoryTimeline,
    historicalAddressObserved: Boolean(historicalAddressObserved),
    historicalObservationType: historicalAddressObserved ? "transaction_participant_only" : "none",
    chainEvidence: assessment,
    transactionInvestigation: validTatum ? {
      provider: "tatum" as const,
      network: "sui-mainnet" as const,
      transport: observation!.transport,
      method: observation!.method,
      digest: observation!.evidence.digest,
      sender: observation!.evidence.sender,
      executionStatus: observation!.evidence.executionStatus,
      balanceChanges: observation!.evidence.balanceChanges.map(change => ({
        address: change.address, amount: change.amount, coinType: change.coinType,
        matchesProposedRecipient: matchesProposed(change.address),
      })),
      checkedAt: observation!.checkedAt,
      independentlyVerified: false as const,
      limitation: "Provider-observed historical transaction data does not prove recipient identity or payment authorization.",
    } : null,
    action: "manual_review_required" as const,
    paymentAuthorized: false as const,
    reasons: [
      unifiedConclusion.message,
      historicalAddressObserved
        ? "Address appeared in provider-observed transaction history; this does not prove ownership or authorization."
        : "No relevant historical address observation was established.",
      "This workflow cannot authorize a payment. Independently verify the recipient.",
    ],
  };
}
