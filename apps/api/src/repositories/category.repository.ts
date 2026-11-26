import { prisma } from '../config/database.js';

/** Category names are public metadata. Do not expose private video counts here. */
export async function findCategories() {
  return prisma.category.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}
