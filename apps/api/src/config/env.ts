import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parseTrustedProxyCidrs } from '../lib/trusted-proxy.js';

// Root .env is the single local configuration source (STREAM-001.4).
// Existing environment variables always take precedence (CI / production).
loadEnv({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  REDIS_URL: z.string().url().optional(),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  RATE_LIMIT_STORE: z.enum(['memory', 'redis']).optional(),
  TRUST_PROXY_CIDRS: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid API environment configuration: ${issues.join('; ')}`);
}

export const env = parsed.data;
// Production must share counters across API replicas; no memory-only override.
export const rateLimitStoreMode =
  env.RATE_LIMIT_STORE ?? (env.NODE_ENV === 'production' ? 'redis' : 'memory');
if (env.NODE_ENV === 'production' && rateLimitStoreMode !== 'redis') {
  throw new Error('Production rate limiting requires RATE_LIMIT_STORE=redis');
}
if (env.NODE_ENV === 'production' && !env.REDIS_URL) {
  throw new Error('Production rate limiting requires an explicit REDIS_URL');
}
export const trustedProxyCidrs = parseTrustedProxyCidrs(env.TRUST_PROXY_CIDRS);
export const allowedOrigins = new Set(
  env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
export const redisUrl = env.REDIS_URL ?? `redis://127.0.0.1:${env.REDIS_PORT}`;
