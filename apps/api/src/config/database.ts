import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { getDatabaseUrl } from './database-url.js';

// API owns migrations. Worker will reuse a controlled database dependency later.
const adapter = new PrismaPg({ connectionString: getDatabaseUrl() });
export const prisma = new PrismaClient({ adapter });

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
