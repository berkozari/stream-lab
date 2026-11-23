import { randomUUID } from 'node:crypto';
import {
  VIDEO_PROCESSING_SMOKE_JOB_NAME,
  type QueueSmokeJobData,
  type QueueSmokeJobResult,
} from '@streamlab/contracts';
import {
  closeVideoProcessingQueue,
  getVideoProcessingQueue,
} from '../src/lib/video-processing-queue.js';

const TIMEOUT_MS = 25_000;
const POLL_INTERVAL_MS = 300;
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs through the API workspace's real queue producer, without an unsecured HTTP route. */
async function runSmoke(): Promise<void> {
  const queue = getVideoProcessingQueue();
  await queue.waitUntilReady();

  const requestId = randomUUID();
  const data: QueueSmokeJobData = {
    requestId,
    queuedAt: new Date().toISOString(),
    failFirstAttempt: process.env.QUEUE_SMOKE_RETRY === '1',
  };
  const job = await queue.add(VIDEO_PROCESSING_SMOKE_JOB_NAME, data, {
    jobId: `smoke-${requestId}`,
    attempts: 3,
    backoff: { type: 'fixed', delay: 350 },
    removeOnComplete: { count: 100, age: 3_600 },
    removeOnFail: { count: 100, age: 3_600 },
  });

  if (!job.id) throw new Error('BullMQ returned a job without an id');
  console.info(`ENQUEUED: ${job.id} (retry test: ${data.failFirstAttempt ? 'on' : 'off'})`);
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    const latest = await queue.getJob(job.id);
    if (!latest) throw new Error(`Job ${job.id} disappeared before the smoke test completed`);
    const state = await latest.getState();

    if (state === 'completed') {
      const result = latest.returnvalue as QueueSmokeJobResult | undefined;
      if (!result || result.requestId !== requestId || !Number.isInteger(result.workerPid)) {
        throw new Error('Worker completed job but returned an invalid result');
      }
      if (data.failFirstAttempt && latest.attemptsMade < 1) {
        throw new Error('Expected the simulated first attempt to fail and retry');
      }
      console.info(`PASS: API producer -> Redis/BullMQ -> worker -> completed (${job.id})`);
      console.info(`WORKER: PID ${result.workerPid}, attemptsMade=${latest.attemptsMade}`);
      return;
    }
    if (state === 'failed') {
      throw new Error(`Worker failed job ${job.id}: ${latest.failedReason ?? 'unknown reason'}`);
    }
    await pause(POLL_INTERVAL_MS);
  }
  throw new Error('Timed out waiting for the worker. Is pnpm dev:worker running?');
}

try {
  await runSmoke();
} catch (error) {
  console.error('FAIL: Queue smoke test', error);
  process.exitCode = 1;
} finally {
  await closeVideoProcessingQueue();
}
