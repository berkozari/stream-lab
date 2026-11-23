import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

// This module is safe for both `tsx prisma/seed.ts` and API runtime imports.
// Explicit DATABASE_URL takes precedence, including in CI and production.
loadEnv({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

export function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB } = process.env;
  const port = process.env.POSTGRES_PORT ?? '5432';
  if (!POSTGRES_USER || !POSTGRES_PASSWORD || !POSTGRES_DB) {
    throw new Error(
      'Set DATABASE_URL or POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB in root .env',
    );
  }

  return `postgresql://${encodeURIComponent(POSTGRES_USER)}:${encodeURIComponent(POSTGRES_PASSWORD)}@127.0.0.1:${port}/${encodeURIComponent(POSTGRES_DB)}`;
}
