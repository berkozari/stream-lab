import { Queue, Worker } from 'bullmq';
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
import { readTranscodingBudget } from '../services/transcoding/resource-budget.js';
import { workerLogger, errorClass } from '../lib/logger.js';
import {
  collectVideoQueueMetrics,
  startQueueMetricsPolling,
} from '../observability/queue-metrics.js';

export async function startVideoProcessingWorker(): Promise<void> {
  // Invalid media policies must fail startup, not burn through live queue attempts.
  const budget = readTranscodingBudget();
  // Long-running consumer: BullMQ requires maxRetriesPerRequest: null.
  const connection = new Redis(workerEnv.redisUrl, { maxRetriesPerRequest: null });
  connection.on('error', (error: Error) => {
    workerLogger.error({ errorClass: errorClass(error) }, 'worker Redis connection error');
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
    workerLogger.info(
      { event: 'job_completed', jobId: job.id, jobName: job.name },
      'worker job completed',
    );
  });
  worker.on('failed', (job, error: Error) => {
    workerLogger.warn(
      {
        event: 'job_failed',
        jobId: job?.id,
        jobName: job?.name,
        errorClass: errorClass(error),
      },
      'worker job attempt failed',
    );
  });
  worker.on('error', (error: Error) => {
    workerLogger.error(
      { event: 'worker_error', errorClass: errorClass(error) },
      'worker queue error',
    );
  });

  // This Queue only reads bounded BullMQ counters, never modifies jobs.
  // Share the existing connection; do not create an additional Redis pool.
  const metricsQueue = new Queue(VIDEO_PROCESSING_QUEUE_NAME, { connection });
  const stopMetrics = startQueueMetricsPolling({
    intervalMs: workerEnv.metricsIntervalMs,
    collect: () => collectVideoQueueMetrics(metricsQueue),
    onSnapshot: (queue) =>
      workerLogger.info(
        { event: 'queue_metrics', queueName: VIDEO_PROCESSING_QUEUE_NAME, queue },
        'worker queue metrics',
      ),
    onError: (error) =>
      workerLogger.warn(
        { event: 'queue_metrics_error', errorClass: errorClass(error) },
        'worker queue metrics unavailable',
      ),
  });

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    workerLogger.info({ signal }, 'worker shutdown requested');
    shutdownController.abort(new Error('TRANSCODING_WORKER_SHUTDOWN'));
    const watchdog = setTimeout(() => {
      workerLogger.fatal('worker shutdown timed out');
      process.exit(1);
    }, 30_000);
    watchdog.unref();
    try {
      await worker.close();
      workerLogger.info('worker stopped');
    } catch (error) {
      workerLogger.error({ errorClass: errorClass(error) }, 'worker shutdown failed');
      process.exitCode = 1;
    } finally {
      try {
        // Stop periodic work before closing its Redis connection.
        await stopMetrics();
        await metricsQueue.close();
      } catch (error) {
        process.exitCode = 1;
        workerLogger.error({ errorClass: errorClass(error) }, 'worker metrics cleanup failed');
      } finally {
        connection.disconnect();
        try {
          await disconnectWorkerDatabase();
        } finally {
          clearTimeout(watchdog);
        }
      }
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
    workerLogger.info(
      {
        queueName: VIDEO_PROCESSING_QUEUE_NAME,
        concurrency: workerEnv.concurrency,
        mediaMaxDurationSeconds: budget.maxDurationSeconds,
        ffmpegThreads: budget.ffmpegThreads,
      },
      'worker listening',
    );
  } catch (error) {
    try {
      await stopMetrics();
      await worker.close(true);
      await metricsQueue.close();
    } finally {
      connection.disconnect();
      await disconnectWorkerDatabase();
    }
    throw error;
  }
}
