import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  VIDEO_PROCESSING_QUEUE_NAME,
  type QueueSmokeJobData,
  type QueueSmokeJobResult,
  type VideoTranscodeJobData,
} from '@streamlab/contracts';
import { redisUrl } from '../config/env.js';
import { logger } from './logger.js';

type VideoProcessingJobData = QueueSmokeJobData | VideoTranscodeJobData;
type VideoProcessingJobResult = QueueSmokeJobResult | void;

let connection: Redis | undefined;
let queue: Queue<VideoProcessingJobData, VideoProcessingJobResult> | undefined;

/** HTTP-side producer should fail quickly when Redis is unavailable. */
export function getVideoProcessingQueue(): Queue<VideoProcessingJobData, VideoProcessingJobResult> {
  if (!queue) {
    connection = new Redis(redisUrl, {
      connectTimeout: 2_000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    connection.on('error', (error: Error) => {
      logger.warn({ err: error }, 'video queue Redis error');
    });
    queue = new Queue<VideoProcessingJobData, VideoProcessingJobResult>(
      VIDEO_PROCESSING_QUEUE_NAME,
      {
        connection,
      },
    );
    queue.on('error', (error: Error) => {
      logger.warn({ err: error }, 'video queue error');
    });
  }
  return queue;
}

export async function closeVideoProcessingQueue(): Promise<void> {
  const currentQueue = queue;
  const currentConnection = connection;
  queue = undefined;
  connection = undefined;
  try {
    await currentQueue?.close();
  } finally {
    currentConnection?.disconnect();
  }
}
