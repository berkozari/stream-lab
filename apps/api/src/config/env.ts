import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

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
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid API environment configuration: ${issues.join('; ')}`);
}

export const env = parsed.data;
export const allowedOrigins = new Set(
  env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
export const redisUrl = env.REDIS_URL ?? `redis://127.0.0.1:${env.REDIS_PORT}`;
