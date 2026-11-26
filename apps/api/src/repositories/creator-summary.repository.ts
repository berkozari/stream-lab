import { prisma } from '../config/database.js';
import type { CreatorVideoStatusCount } from '../lib/creator-summary-metrics.js';

/** Both queries scope to the authenticated owner and exclude soft-deleted videos. */
export async function readCreatorSummary(ownerId: string): Promise<{
  statusCounts: CreatorVideoStatusCount[];
  publishedVideos: number;
}> {
  const where = { ownerId, deletedAt: null };
  const [groups, publishedVideos] = await Promise.all([
    prisma.video.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    }),
    prisma.video.count({
      where: {
        ...where,
        status: 'READY',
        visibility: { in: ['PUBLIC', 'UNLISTED'] },
        publishedAt: { not: null },
      },
    }),
  ]);
  return {
    statusCounts: groups.map((group) => ({ status: group.status, count: group._count._all })),
    publishedVideos,
  };
}
