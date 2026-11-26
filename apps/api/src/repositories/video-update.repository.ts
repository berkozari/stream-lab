import type { UpdateVideoRequest } from '@streamlab/contracts';
import { prisma } from '../config/database.js';
import { AppError } from '../utils/app-error.js';
import { planVideoPublication } from '../lib/video-publication.js';
import type { CreatedVideoRecord } from './video.repository.js';

const videoSelect = {
  id: true,
  ownerId: true,
  title: true,
  description: true,
  categories: { select: { categoryId: true }, orderBy: { categoryId: 'asc' } },
  status: true,
  visibility: true,
  durationSeconds: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const notFound = () => new AppError(404, 'VIDEO_NOT_FOUND', 'Video not found');
const conflict = () =>
  new AppError(
    409,
    'VIDEO_NOT_PUBLISHABLE',
    'Video must be READY before it can be public or unlisted',
  );

/** Owner-scoped, atomic metadata and category replacement. Sets the first publication time for READY videos; never changes processing state. */
export async function updateOwnedVideoMetadata(
  videoId: string,
  ownerId: string,
  input: UpdateVideoRequest,
): Promise<CreatedVideoRecord> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.video.findFirst({
      where: { id: videoId, ownerId, deletedAt: null },
      select: { id: true, status: true, publishedAt: true },
    });
    if (!existing) throw notFound();
    if (existing.status === 'DELETING') {
      throw new AppError(409, 'VIDEO_DELETING', 'Video is being deleted');
    }

    const publication = planVideoPublication(existing, input.visibility);
    if (!publication.allowed) {
      throw conflict();
    }

    if (input.categoryIds !== undefined && input.categoryIds.length > 0) {
      const categories = await tx.category.findMany({
        where: { id: { in: input.categoryIds } },
        select: { id: true },
      });
      if (categories.length !== input.categoryIds.length) {
        throw new AppError(422, 'CATEGORY_NOT_FOUND', 'One or more categories do not exist');
      }
    }

    // Guard the state again at write time: processing or deletion can race this request.
    const updated = await tx.video.updateMany({
      where: {
        id: videoId,
        ownerId,
        deletedAt: null,
        ...(publication.exposing
          ? { status: 'READY' as const }
          : { status: { not: 'DELETING' as const } }),
      },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(publication.publishedAt ? { publishedAt: publication.publishedAt } : {}),
        updatedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      const current = await tx.video.findFirst({
        where: { id: videoId, ownerId, deletedAt: null },
        select: { id: true },
      });
      if (!current) throw notFound();
      throw new AppError(409, 'VIDEO_STATE_CHANGED', 'Video state changed; please retry');
    }

    if (input.categoryIds !== undefined) {
      await tx.videoCategory.deleteMany({ where: { videoId } });
      if (input.categoryIds.length > 0) {
        await tx.videoCategory.createMany({
          data: input.categoryIds.map((categoryId) => ({ videoId, categoryId })),
        });
      }
    }

    const result = await tx.video.findUnique({ where: { id: videoId }, select: videoSelect });
    if (!result) throw notFound();
    return result;
  });
}
