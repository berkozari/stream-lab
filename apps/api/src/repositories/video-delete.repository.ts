import { prisma } from '../config/database.js';
import { AppError } from '../utils/app-error.js';

/**
 * An atomic, owner-scoped soft delete. Conditional updateMany guards against
 * concurrent deletes and metadata edits without a read-then-write race.
 * Related database records and objects are retained for deferred cleanup.
 */
export async function softDeleteOwnedVideo(videoId: string, ownerId: string): Promise<void> {
  const deletedAt = new Date();
  const result = await prisma.video.updateMany({
    where: {
      id: videoId,
      ownerId,
      deletedAt: null,
      status: { not: 'DELETING' },
    },
    data: {
      status: 'DELETING',
      visibility: 'PRIVATE',
      deletedAt,
      updatedAt: deletedAt,
    },
  });

  // Same response for nonexistent, foreign-owned, and already-deleted videos.
  if (result.count !== 1) {
    throw new AppError(404, 'VIDEO_NOT_FOUND', 'Video not found');
  }
}
