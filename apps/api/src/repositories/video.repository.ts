import type { CreateVideoRequest } from '@streamlab/contracts';
import { prisma } from '../config/database.js';
import { AppError } from '../utils/app-error.js';

const videoResponseSelect = {
  id: true,
  ownerId: true,
  title: true,
  description: true,
  status: true,
  visibility: true,
  durationSeconds: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Create a private draft with category links in one transaction.
 * The caller must supply the server-authenticated owner ID, never an HTTP body field.
 */
export async function insertVideoDraft(ownerId: string, input: CreateVideoRequest) {
  const categoryIds = input.categoryIds ?? [];

  return prisma.$transaction(async (tx) => {
    if (categoryIds.length > 0) {
      const categories = await tx.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true },
      });
      if (categories.length !== categoryIds.length) {
        throw new AppError(422, 'CATEGORY_NOT_FOUND', 'One or more categories do not exist');
      }
    }

    return tx.video.create({
      data: {
        ownerId,
        title: input.title,
        description: input.description ?? null,
        ...(categoryIds.length > 0
          ? {
              categories: {
                create: categoryIds.map((categoryId) => ({
                  category: { connect: { id: categoryId } },
                })),
              },
            }
          : {}),
      },
      select: videoResponseSelect,
    });
  });
}

export type CreatedVideoRecord = Awaited<ReturnType<typeof insertVideoDraft>>;
