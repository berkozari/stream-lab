import { prisma, disconnectDatabase } from '../src/config/database.js';

const categories = [
  { slug: 'education', name: 'Education' },
  { slug: 'technology', name: 'Technology' },
  { slug: 'entertainment', name: 'Entertainment' },
  { slug: 'documentary', name: 'Documentary' },
  { slug: 'gaming', name: 'Gaming' },
] as const;

async function main(): Promise<void> {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name },
    });
  }
  console.log(`Seed complete: ${categories.length} categories (idempotent).`);
}

main()
  .catch((error: unknown) => {
    console.error('Database seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
