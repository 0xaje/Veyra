import test from "node:test";
import assert from "node:assert/strict";
import { writeRecipientEvidenceEvent } from "../src/core/recipient-evidence-writer.ts";
import type { RecipientEvidenceEventInput } from "../src/core/recipient-evidence-event.ts";

const input: RecipientEvidenceEventInput = {
  counterpartyId: "public-reference",
  address: "0x1",
  eventType: "source_observed",
  source: {
    kind: "public_official_document",
    reference: "https://example.org/reference",
    observedAt: "2026-10-22T12:00:00.000Z",
  },
  userApprovedStorage: true,
};
test("disabled writes never contact SDK", async () => {
  const writer = {
    remember: async (_content: string) => { throw Error("should not call"); },
    waitForRememberJob: async (_id: string) => { throw Error("should not call"); },
  };
  const result = await writeRecipientEvidenceEvent(input, writer, { writesEnabled: false });
  assert.equal(result.state.status, "not_attempted");
  assert.equal(result.paymentAuthorized, false);
});
test("accepted job requires real completion blob ID", async () => {
  let payload = "";
  const writer = {
    remember: async (content: string) => { payload = content; return { job_id: "job-from-provider" }; },
    waitForRememberJob: async (id: string) => {
      assert.equal(id, "job-from-provider");
      return { blob_id: "blob-from-provider" };
    },
  };
  const result = await writeRecipientEvidenceEvent(input, writer, { writesEnabled: true });
  assert.deepEqual(result.state, { status: "stored", jobId: "job-from-provider", blobId: "blob-from-provider" });
  assert.equal(JSON.parse(payload).trust, "informational_unverified");
  assert.equal(result.paymentAuthorized, false);
});
test("missing durable blob ID is not stored", async () => {
  const result = await writeRecipientEvidenceEvent(input, {
    remember: async () => ({ job_id: "job" }),
    waitForRememberJob: async () => ({}),
  }, { writesEnabled: true });
  assert.equal(result.state.status, "failed");
});
test("provider failure cannot count as stored", async () => {
  const result = await writeRecipientEvidenceEvent(input, {
    remember: async () => { throw Error("service unavailable"); },
    waitForRememberJob: async () => ({}),
  }, { writesEnabled: true });
  assert.equal(result.state.status, "failed");
});
test("invalid consent is rejected before SDK call", async () => {
  let contacted = false;
  await assert.rejects(() => writeRecipientEvidenceEvent({ ...input, userApprovedStorage: false }, {
    remember: async () => { contacted = true; return {}; },
    waitForRememberJob: async () => ({}),
  }, { writesEnabled: true }), /approval/);
  assert.equal(contacted, false);
});
