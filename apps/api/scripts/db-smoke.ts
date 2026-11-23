import { prisma, disconnectDatabase } from '../src/config/database.js';

const expectedSlugs = ['education', 'technology', 'entertainment', 'documentary', 'gaming'];

async function main(): Promise<void> {
  const result = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
  if (result[0]?.ok !== 1) throw new Error('PostgreSQL SELECT 1 failed');

  const [users, videos, categories] = await Promise.all([
    prisma.user.count(),
    prisma.video.count(),
    prisma.category.findMany({ where: { slug: { in: expectedSlugs } }, select: { slug: true } }),
  ]);

  const found = new Set(categories.map((category) => category.slug));
  const missing = expectedSlugs.filter((slug) => !found.has(slug));
  if (missing.length) {
    throw new Error(`Missing seed categories: ${missing.join(', ')}. Run pnpm db:seed.`);
  }

  console.log(
    `PASS: PostgreSQL, Prisma Client, User (${users}), Video (${videos}), seed (${categories.length}).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Database smoke test failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
