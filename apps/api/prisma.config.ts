import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

// The local infrastructure task created .env at repository root.
const apiDir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(apiDir, '../../.env'), quiet: true });

function databaseUrl(): string {
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

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: { url: databaseUrl() },
});
