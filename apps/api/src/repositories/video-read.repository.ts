import { prisma } from '../config/database.js';
import type { CreatedVideoRecord } from './video.repository.js';
import type { VideoCursorPosition } from '../lib/video-cursor.js';
import { videoSearchFilter } from '../lib/discovery-search-pattern.js';

const videoReadSelect = {
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

export type VideoReadRecord = Omit<CreatedVideoRecord, 'categories'> & {
  categories?: Array<{ categoryId: string }>;
};
export type VideoReadFilter = {
  scope: 'public' | 'mine';
  userId?: string;
  limit: number;
  q?: string;
  category?: string;
  cursor?: VideoCursorPosition;
};

/** Stable keyset pagination. Never expose private/draft/deleted videos in public discovery. */
export async function findVideoPage(filter: VideoReadFilter): Promise<VideoReadRecord[]> {
  const where = {
    deletedAt: null,
    ...(filter.scope === 'public'
      ? { status: 'READY' as const, visibility: 'PUBLIC' as const, publishedAt: { not: null } }
      : { ownerId: filter.userId }),
    ...(filter.q ? videoSearchFilter(filter.q) : {}),
    ...(filter.category ? { categories: { some: { category: { slug: filter.category } } } } : {}),
    ...(filter.cursor
      ? {
          AND: [
            {
              OR: [
                { createdAt: { lt: filter.cursor.createdAt } },
                { createdAt: filter.cursor.createdAt, id: { lt: filter.cursor.id } },
              ],
            },
          ],
        }
      : {}),
  };
  return prisma.video.findMany({
    where,
    select: videoReadSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: filter.limit + 1,
  });
}

/** Soft-deleted records are invisible even to their original owner. */
export async function findVideoForDetail(videoId: string): Promise<VideoReadRecord | null> {
  return prisma.video.findFirst({
    where: { id: videoId, deletedAt: null },
    select: videoReadSelect,
  });
}
