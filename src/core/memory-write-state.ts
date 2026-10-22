/**
 * Memory-write lifecycle classification.
 * Acceptance of a job is not proof of durable storage.
 */
export type MemoryWriteState =
  | { status: "not_attempted" }
  | { status: "pending"; jobId: string }
  | { status: "stored"; jobId: string; blobId: string }
  | { status: "failed"; jobId?: string; reason: string };

export function acceptedMemoryJob(job: { job_id?: unknown }): MemoryWriteState {
  if (typeof job.job_id !== "string" || !job.job_id.trim()) {
    return { status: "failed", reason: "Relayer did not return a valid job ID" };
  }
  return { status: "pending", jobId: job.job_id };
}

export function completedMemoryJob(
  pending: MemoryWriteState,
  result: { blob_id?: unknown },
): MemoryWriteState {
  if (pending.status !== "pending") {
    throw new Error("A completed write must originate from a pending job");
  }
  if (typeof result.blob_id !== "string" || !result.blob_id.trim()) {
    return { status: "failed", jobId: pending.jobId, reason: "Completed job has no durable blob ID" };
  }
  return { status: "stored", jobId: pending.jobId, blobId: result.blob_id };
}

export function failedMemoryJob(pending: MemoryWriteState, reason: string): MemoryWriteState {
  if (pending.status !== "pending") throw new Error("Only pending jobs can fail");
  return { status: "failed", jobId: pending.jobId, reason: reason || "Unknown memory write failure" };
}
