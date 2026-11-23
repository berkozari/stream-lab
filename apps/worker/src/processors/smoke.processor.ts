import type { Job } from 'bullmq';
import {
  VIDEO_PROCESSING_SMOKE_JOB_NAME,
  type QueueSmokeJobData,
  type QueueSmokeJobResult,
} from '@streamlab/contracts';

/** STREAM-001.8 dummy processor. Actual transcoding is introduced in STREAM-005. */
export async function processSmokeJob(
  job: Job<QueueSmokeJobData, QueueSmokeJobResult>,
): Promise<QueueSmokeJobResult> {
  if (job.name !== VIDEO_PROCESSING_SMOKE_JOB_NAME) {
    throw new Error(`Unsupported job name: ${job.name}`);
  }
  if (
    !job.data ||
    typeof job.data.requestId !== 'string' ||
    job.data.requestId.length === 0 ||
    typeof job.data.queuedAt !== 'string' ||
    Number.isNaN(Date.parse(job.data.queuedAt))
  ) {
    throw new Error('Invalid smoke job payload');
  }
  if (job.data.failFirstAttempt === true && job.attemptsMade === 0) {
    throw new Error('Simulated first-attempt error (retry verification)');
  }
  return {
    requestId: job.data.requestId,
    processedAt: new Date().toISOString(),
    workerPid: process.pid,
  };
}
