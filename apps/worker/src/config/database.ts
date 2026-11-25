import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import './env.js'; // Load root .env before evaluating configuration.

/** Worker uses its OWN Prisma client, generated from the API-owned schema. */
function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB } = process.env;
  const port = process.env.POSTGRES_PORT ?? '5432';
  if (!POSTGRES_USER || !POSTGRES_PASSWORD || !POSTGRES_DB) {
    throw new Error('Worker needs DATABASE_URL or POSTGRES_USER/PASSWORD/DB');
  }
  return `postgresql://${encodeURIComponent(POSTGRES_USER)}:${encodeURIComponent(POSTGRES_PASSWORD)}@127.0.0.1:${port}/${encodeURIComponent(POSTGRES_DB)}`;
}

const adapter = new PrismaPg({ connectionString: databaseUrl() });
export const workerPrisma = new PrismaClient({ adapter });
export async function disconnectWorkerDatabase(): Promise<void> {
  await workerPrisma.$disconnect();
}
