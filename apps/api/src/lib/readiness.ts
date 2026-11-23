import { logger } from './logger.js';

export type ReadinessReport = {
  status: 'ready' | 'not_ready';
  service: 'api';
  checks: { database: 'up' | 'down'; redis: 'up' | 'down' };
  timestamp: string;
};

async function withTimeout(work: Promise<unknown>, ms: number): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Dependency check timed out')), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function databaseCheck(): Promise<void> {
  // Import lazily so app creation and isolated HTTP tests do not require a database.
  const { prisma } = await import('../config/database.js');
  await prisma.$queryRaw`SELECT 1`;
}

async function redisCheck(): Promise<void> {
  const { getRedisClient } = await import('../config/redis.js');
  await getRedisClient().ping();
}

async function check(name: 'database' | 'redis', fn: () => Promise<void>): Promise<'up' | 'down'> {
  try {
    await withTimeout(fn(), 2_000);
    return 'up';
  } catch (error) {
    logger.warn({ err: error, dependency: name }, 'readiness dependency unavailable');
    return 'down';
  }
}

export async function checkReadiness(): Promise<ReadinessReport> {
  const [database, redis] = await Promise.all([
    check('database', databaseCheck),
    check('redis', redisCheck),
  ]);
  return {
    status: database === 'up' && redis === 'up' ? 'ready' : 'not_ready',
    service: 'api',
    checks: { database, redis },
    timestamp: new Date().toISOString(),
  };
}
