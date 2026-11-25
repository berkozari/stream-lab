import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { VIDEO_PROCESSING_QUEUE_NAME } from '@streamlab/contracts';
import { workerEnv } from '../config/env.js';
import {
  createVideoProcessingRouter,
  type ProcessingJobResult,
} from '../processors/video-processing.router.js';
import {
  createVideoTranscodeProcessor,
  transcodingLeaseOperations,
} from '../processors/video-transcode.processor.js';
import { publishHls } from '../services/transcoding/publish-hls.js';
import { disconnectWorkerDatabase } from '../config/database.js';

export async function startVideoProcessingWorker(): Promise<void> {
  // Long-running consumer: BullMQ requires maxRetriesPerRequest: null.
  const connection = new Redis(workerEnv.redisUrl, { maxRetriesPerRequest: null });
  connection.on('error', (error: Error) => {
    console.error('[worker] Redis connection error:', error.message);
  });

  // Shared by all active transcodes; SIGTERM/SIGINT cooperatively aborts FFmpeg
  // and parks jobs for a later attempt without spending their retry budget.
  const shutdownController = new AbortController();
  const processor = createVideoProcessingRouter(
    createVideoTranscodeProcessor({
      ...transcodingLeaseOperations,
      publishHls,
      shutdownSignal: shutdownController.signal,
    }),
  );
  const worker = new Worker<unknown, ProcessingJobResult>(
    VIDEO_PROCESSING_QUEUE_NAME,
    (job, token) => processor(job, token),
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
    console.info(`[worker] ${signal} received; cancelling active media work`);
    shutdownController.abort(new Error('TRANSCODING_WORKER_SHUTDOWN'));
    const watchdog = setTimeout(() => {
      console.error('[worker] shutdown timed out');
      process.exit(1);
    }, 30_000);
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
      await disconnectWorkerDatabase();
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
    await disconnectWorkerDatabase();
    throw error;
  }
}
