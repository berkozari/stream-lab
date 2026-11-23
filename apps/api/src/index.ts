import { createApp } from './app.js';
import { env } from './config/env.js';
import { getAuthSecrets } from './config/auth-env.js';
import { getDatabaseUrl } from './config/database-url.js';
import { disconnectDatabase } from './config/database.js';
import { disconnectRedis } from './config/redis.js';
import { logger } from './lib/logger.js';

// Validate database and auth secrets before opening the HTTP port.
getDatabaseUrl();
getAuthSecrets();

const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'StreamLab API listening');
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down API');
  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    const cleanup = await Promise.allSettled([
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
