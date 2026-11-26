import { prisma } from '../config/database.js';

export type PlaybackSession = {
  id: string;
  videoId: string;
  viewerId: string | null;
  processingVersion: number;
  lastSequence: number;
  lastPositionSeconds: number;
  watchedSeconds: number;
  qualifiedAt: Date | null;
  completedAt: Date | null;
  lastEventAt: Date;
  startedAt: Date;
};
export type SessionIdentity = {
  id: string;
  videoId: string;
  viewerId: string | null;
  processingVersion: number;
};
export type SessionUpdate = {
  sequence: number;
  positionSeconds: number;
  increment: number;
  qualifiedAt: Date | null;
  completedAt: Date | null;
  now: Date;
};

/** Upsert is safe under concurrent first heartbeats; identity never changes on conflict. */
export async function ensureAnalyticsSession(identity: SessionIdentity, now: Date) {
  await prisma.playbackAnalyticsSession.upsert({
    where: { id: identity.id },
    create: {
      ...identity,
      lastSequence: -1,
      watchedSeconds: 0,
      lastPositionSeconds: 0,
      startedAt: now,
      lastEventAt: now,
    },
    update: {},
  });
}
export async function readAnalyticsSession(id: string): Promise<PlaybackSession | null> {
  return prisma.playbackAnalyticsSession.findUnique({ where: { id } });
}
/** Optimistic compare-and-swap protects a session against concurrent or reordered updates. */
export async function advanceAnalyticsSession(
  id: string,
  previousSequence: number,
  update: SessionUpdate,
): Promise<boolean> {
  const result = await prisma.playbackAnalyticsSession.updateMany({
    where: { id, lastSequence: previousSequence },
    data: {
      lastSequence: update.sequence,
      lastPositionSeconds: update.positionSeconds,
      watchedSeconds: { increment: update.increment },
      qualifiedAt: update.qualifiedAt,
      completedAt: update.completedAt,
      lastEventAt: update.now,
    },
  });
  return result.count === 1;
}
