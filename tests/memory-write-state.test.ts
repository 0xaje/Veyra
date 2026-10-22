import test from "node:test";
import assert from "node:assert/strict";
import { acceptedMemoryJob, completedMemoryJob, failedMemoryJob } from "../src/core/memory-write-state.ts";

test("accepted job remains pending", () => {
  assert.deepEqual(acceptedMemoryJob({ job_id: "job-1" }), { status: "pending", jobId: "job-1" });
});
test("invalid acceptance never becomes pending", () => {
  assert.equal(acceptedMemoryJob({ job_id: "" }).status, "failed");
});
test("completed job requires a durable blob ID", () => {
  assert.deepEqual(completedMemoryJob(acceptedMemoryJob({ job_id: "job-1" }), { blob_id: "blob-1" }), {
    status: "stored", jobId: "job-1", blobId: "blob-1",
  });
});
test("missing blob ID is a failed write", () => {
  assert.equal(completedMemoryJob(acceptedMemoryJob({ job_id: "job-1" }), {}).status, "failed");
});
test("upstream failure retains job ID and never becomes stored", () => {
  const result = failedMemoryJob(acceptedMemoryJob({ job_id: "job-1" }), "Embedding API 401");
  assert.deepEqual(result, { status: "failed", jobId: "job-1", reason: "Embedding API 401" });
});
test("cannot mark a write completed without acceptance", () => {
  assert.throws(() => completedMemoryJob({ status: "not_attempted" }, { blob_id: "blob-1" }), /pending job/);
});
