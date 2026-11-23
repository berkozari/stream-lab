import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import {
  VIDEO_PROCESSING_QUEUE_NAME,
  type QueueSmokeJobData,
  type QueueSmokeJobResult,
} from '@streamlab/contracts';
import { workerEnv } from '../config/env.js';
import { processSmokeJob } from '../processors/smoke.processor.js';

export async function startVideoProcessingWorker(): Promise<void> {
  // Long-running consumer: BullMQ requires maxRetriesPerRequest: null.
  const connection = new Redis(workerEnv.redisUrl, { maxRetriesPerRequest: null });
  connection.on('error', (error: Error) => {
    console.error('[worker] Redis connection error:', error.message);
  });

  const worker = new Worker<QueueSmokeJobData, QueueSmokeJobResult>(
    VIDEO_PROCESSING_QUEUE_NAME,
    processSmokeJob,
    { connection, concurrency: workerEnv.concurrency },
  );
  worker.on('completed', (job) => {
    console.info(`[worker] completed job=${job.id}`);
  });
  worker.on('failed', (job, error: Error) => {
    console.warn(`[worker] failed attempt job=${job?.id ?? 'unknown'}: ${error.message}`);
  });
  worker.on('error', (error: Error) => {
    console.error('[worker] queue error:', error);
  });

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[worker] ${signal} received; waiting for active jobs to finish`);
    const watchdog = setTimeout(() => {
      console.error('[worker] shutdown timed out');
      process.exit(1);
    }, 10_000);
    watchdog.unref();
    try {
      await worker.close();
      console.info('[worker] stopped');
    } catch (error) {
      console.error('[worker] error during shutdown', error);
      process.exitCode = 1;
    } finally {
      clearTimeout(watchdog);
      connection.disconnect();
    }
  }

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  try {
    await worker.waitUntilReady();
    console.info(
      `[worker] listening queue=${VIDEO_PROCESSING_QUEUE_NAME}; concurrency=${workerEnv.concurrency}`,
    );
  } catch (error) {
    await worker.close(true);
    connection.disconnect();
    throw error;
  }
}
