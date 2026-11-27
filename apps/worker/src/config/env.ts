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

function parseLogLevel(
  raw: string,
): 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent' {
  const levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
  const level = levels.find((candidate) => candidate === raw);
  if (!level) throw new Error('Invalid WORKER_LOG_LEVEL/LOG_LEVEL');
  return level;
}

const redisPort = integerEnv('REDIS_PORT', 6379, 65535);
export const workerEnv = {
  redisUrl: process.env.REDIS_URL ?? `redis://127.0.0.1:${redisPort}`,
  concurrency: integerEnv('WORKER_CONCURRENCY', 1, 16),
  metricsIntervalMs: integerEnv('WORKER_METRICS_INTERVAL_MS', 60_000, 600_000),
  logLevel: parseLogLevel(process.env.WORKER_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'info'),
} as const;
