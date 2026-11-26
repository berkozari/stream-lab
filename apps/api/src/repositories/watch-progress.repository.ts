import { prisma } from '../config/database.js';
import type {
  WatchCursor,
  WatchListMode,
  WatchViewer,
} from '../services/watch-progress.service.js';

function visibleWatchVideo(viewer: WatchViewer) {
  const accessible =
    viewer.role === 'ADMIN'
      ? {}
      : {
          OR: [
            { ownerId: viewer.userId },
            { visibility: { not: 'PRIVATE' as const }, publishedAt: { not: null } },
          ],
        };
  return {
    deletedAt: null,
    status: 'READY' as const,
    ...accessible,
  };
}

export async function findEligibleWatchVideo(videoId: string, viewer: WatchViewer) {
  return prisma.video.findFirst({
    where: { id: videoId, ...visibleWatchVideo(viewer) },
    select: { id: true, durationSeconds: true },
  });
}

export async function readWatchProgress(userId: string, videoId: string) {
  return prisma.watchProgress.findUnique({
    where: { userId_videoId: { userId, videoId } },
    select: { videoId: true, positionSeconds: true, completedAt: true, lastWatchedAt: true },
  });
}

export async function saveWatchProgress(
  userId: string,
  videoId: string,
  positionSeconds: number,
  completedAt: Date | null,
  lastWatchedAt: Date,
) {
  return prisma.watchProgress.upsert({
    where: { userId_videoId: { userId, videoId } },
    create: { userId, videoId, positionSeconds, completedAt, lastWatchedAt },
    update: { positionSeconds, completedAt, lastWatchedAt },
    select: { videoId: true, positionSeconds: true, completedAt: true, lastWatchedAt: true },
  });
}

export async function listWatchProgress({
  viewer,
  mode,
  limit,
  cursor,
}: {
  viewer: WatchViewer;
  mode: WatchListMode;
  limit: number;
  cursor?: WatchCursor;
}) {
  return prisma.watchProgress.findMany({
    where: {
      userId: viewer.userId,
      video: visibleWatchVideo(viewer),
      ...(mode === 'continue' ? { completedAt: null, positionSeconds: { gt: 0 } } : {}),
      ...(cursor
        ? {
            OR: [
              { lastWatchedAt: { lt: cursor.lastWatchedAt } },
              { lastWatchedAt: cursor.lastWatchedAt, videoId: { lt: cursor.videoId } },
            ],
          }
        : {}),
    },
    select: {
      videoId: true,
      positionSeconds: true,
      completedAt: true,
      lastWatchedAt: true,
      video: {
        select: { id: true, title: true, durationSeconds: true, visibility: true },
      },
    },
    orderBy: [{ lastWatchedAt: 'desc' }, { videoId: 'desc' }],
    take: limit + 1,
  });
}
