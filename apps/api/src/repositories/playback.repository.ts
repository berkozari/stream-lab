import { prisma } from '../config/database.js';

const playbackSelect = {
  id: true,
  ownerId: true,
  visibility: true,
  status: true,
  publishedAt: true,
  processingVersion: true,
  mediaAssets: {
    where: { kind: 'HLS_MASTER' as const },
    select: { storageKey: true, processingVersion: true },
  },
  renditions: {
    select: {
      label: true,
      width: true,
      height: true,
      bitrate: true,
      playlistKey: true,
      processingVersion: true,
    },
  },
} as const;

/** The database is the source of truth; no storage key comes from request parameters. */
export async function findPlaybackVideo(id: string) {
  return prisma.video.findFirst({
    where: { id, deletedAt: null },
    select: playbackSelect,
  });
}

export type PlaybackRecord = NonNullable<Awaited<ReturnType<typeof findPlaybackVideo>>>;
