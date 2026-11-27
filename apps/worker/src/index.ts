// STREAM-001.8: BullMQ worker entrypoint. FFmpeg is introduced in STREAM-005.
import { startVideoProcessingWorker } from './jobs/video-processing.worker.js';
import { workerLogger, errorClass } from './lib/logger.js';

try {
  await startVideoProcessingWorker();
} catch (error) {
  workerLogger.fatal({ errorClass: errorClass(error) }, 'worker startup failed');
  process.exitCode = 1;
}
