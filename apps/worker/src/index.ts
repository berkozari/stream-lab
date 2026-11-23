// STREAM-001.8: BullMQ worker entrypoint. FFmpeg is introduced in STREAM-005.
import { startVideoProcessingWorker } from './jobs/video-processing.worker.js';

try {
  await startVideoProcessingWorker();
} catch (error) {
  console.error('[worker] startup failed', error);
  process.exitCode = 1;
}
