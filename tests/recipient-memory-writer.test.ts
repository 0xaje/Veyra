import test from "node:test";
import assert from "node:assert/strict";
import { registerRecipientWithWalrus, type WalrusMemoryWriter } from "../src/core/recipient-memory-writer.ts";
import type { RecipientRegistrationInput } from "../src/core/recipient-registration.ts";

const input: RecipientRegistrationInput = {
  chain: "sui", network: "mainnet", counterpartyId: "example",
  address: "0x1", userApprovedStorage: true,
  confirmation: {
    method: "independent_contact", confirmedAt: "2026-10-21T12:00:00.000Z",
    reference: "confirmation-1",
  },
};
test("disabled writes do not call SDK", async () => {
  const writer: WalrusMemoryWriter = {
    remember: async () => { throw new Error("should not run"); },
    waitForRememberJob: async () => { throw new Error("should not run"); },
  };
  const result = await registerRecipientWithWalrus(input, writer, { writesEnabled: false });
  assert.equal(result.state.status, "not_attempted");
});
test("accepted job is pending until completed with blob ID", async () => {
  const seen: string[] = [];
  const writer: WalrusMemoryWriter = {
    remember: async (content) => {
      assert.equal(JSON.parse(content).type, "veyra.recipient.v1");
      return { job_id: "job-1" };
    },
    waitForRememberJob: async (jobId) => {
      assert.equal(jobId, "job-1");
      return { blob_id: "blob-1" };
    },
  };
  const result = await registerRecipientWithWalrus(input, writer, {
    writesEnabled: true, onState: (state) => seen.push(state.status),
  });
  assert.deepEqual(seen, ["pending", "stored"]);
  assert.equal(result.state.status, "stored");
});
test("upstream embedding failure remains failed with job ID", async () => {
  const result = await registerRecipientWithWalrus(input, {
    remember: async () => ({ job_id: "job-2" }),
    waitForRememberJob: async () => { throw new Error("Embedding API 401"); },
  }, { writesEnabled: true });
  assert.deepEqual(result.state, { status: "failed", jobId: "job-2", reason: "Embedding API 401" });
});
test("invalid user consent blocks the write before SDK call", async () => {
  await assert.rejects(registerRecipientWithWalrus({ ...input, userApprovedStorage: false }, {
    remember: async () => { throw new Error("should not run"); },
    waitForRememberJob: async () => ({ blob_id: "blob-1" }),
  }, { writesEnabled: true }), /Explicit user approval/);
});
test("missing durable blob ID cannot be marked stored", async () => {
  const result = await registerRecipientWithWalrus(input, {
    remember: async () => ({ job_id: "job-3" }),
    waitForRememberJob: async () => ({}),
  }, { writesEnabled: true });
  assert.equal(result.state.status, "failed");
});
