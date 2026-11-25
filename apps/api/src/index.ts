import { createApp } from './app.js';
import { env } from './config/env.js';
import { getAuthSecrets } from './config/auth-env.js';
import { getDatabaseUrl } from './config/database-url.js';
import { disconnectDatabase } from './config/database.js';
import { disconnectRedis } from './config/redis.js';
import { logger } from './lib/logger.js';
import { closeVideoProcessingQueue } from './lib/video-processing-queue.js';
import { startTranscodingOutboxDispatcher } from './services/video-transcode-dispatcher-loop.js';
import { startTranscodingRecoveryLoop } from './services/video-transcode-recovery-loop.js';

// Validate database and auth secrets before opening the HTTP port.
getDatabaseUrl();
getAuthSecrets();

const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'StreamLab API listening');
});
// The dispatcher is intentionally co-located with the API for this modular monolith.
// Its DB claims are lease/CAS protected, so multiple API replicas may poll safely.
const stopTranscodingDispatcher = startTranscodingOutboxDispatcher();
const stopTranscodingRecovery = startTranscodingRecoveryLoop();

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down API');
  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    // Drain the dispatch loop BEFORE closing its database and Redis queue clients.
    await Promise.all([stopTranscodingDispatcher(), stopTranscodingRecovery()]);
    const cleanup = await Promise.allSettled([
      closeVideoProcessingQueue(),
      disconnectDatabase(),
      Promise.resolve().then(disconnectRedis),
    ]);
    if (cleanup.some((result) => result.status === 'rejected')) {
      process.exitCode = 1;
      logger.error({ cleanup }, 'some resources failed to close');
    }
  } catch (error) {
    process.exitCode = 1;
    logger.error({ err: error }, 'failed to shut down HTTP server');
  }
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
