import { Redis } from 'ioredis';
import { redisUrl } from './env.js';
import { logger } from '../lib/logger.js';

let client: Redis | undefined;

export function getRedisClient(): Redis {
  if (!client) {
    client = new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 1_500,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });

    const current = client;

    current.on('error', (error: Error) => {
      logger.warn({ err: error }, 'redis connection failed');
    });

    current.on('end', () => {
      if (client === current) {
        client = undefined;
      }
    });
  }

  return client;
}

export function disconnectRedis(): void {
  client?.disconnect();
  client = undefined;
}
