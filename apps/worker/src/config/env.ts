import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

// Follow the API convention: the monorepo root .env is the local source.
loadEnv({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

function integerEnv(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`Invalid ${name}: expected an integer between 1 and ${max}`);
  }
  return value;
}

const redisPort = integerEnv('REDIS_PORT', 6379, 65535);
export const workerEnv = {
  redisUrl: process.env.REDIS_URL ?? `redis://127.0.0.1:${redisPort}`,
  concurrency: integerEnv('WORKER_CONCURRENCY', 1, 16),
} as const;
