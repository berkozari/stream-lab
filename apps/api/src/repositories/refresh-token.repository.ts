import { prisma } from '../config/database.js';

export type RefreshUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'USER' | 'ADMIN';
  createdAt: Date;
};

export type RotationOutcome =
  | { kind: 'rotated'; sessionId: string; user: RefreshUser }
  | { kind: 'replayed' }
  | { kind: 'invalid' };

/**
 * Rotate in a database transaction. A conditional UPDATE prevents two requests
 * from successfully consuming the same token. Keep consumed hashes for replay
 * detection; tokens themselves are never stored or logged.
 */
export async function rotateRefreshSession(
  oldHash: string,
  nextHash: string,
  nextExpiresAt: Date,
): Promise<RotationOutcome> {
  const now = new Date();
  const current = await prisma.authSession.findUnique({
    where: { refreshTokenHash: oldHash },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          createdAt: true,
        },
      },
    },
  });

  // Replay can also be observed when a concurrent rotation just won the race.
  if (!current) return revokeIfConsumed(oldHash, now);
  if (current.revokedAt || current.expiresAt <= now) return { kind: 'invalid' };

  const changed = await prisma.$transaction(async (tx) => {
    const update = await tx.authSession.updateMany({
      where: {
        id: current.id,
        refreshTokenHash: oldHash,
        expiresAt: { gt: now },
        revokedAt: null,
      },
      data: { refreshTokenHash: nextHash, expiresAt: nextExpiresAt },
    });
    if (update.count !== 1) return false;
    await tx.consumedRefreshToken.create({
      data: { tokenHash: oldHash, sessionId: current.id, consumedAt: now },
    });
    return true;
  });

  if (!changed) return revokeIfConsumed(oldHash, now);
  return { kind: 'rotated', sessionId: current.id, user: current.user };
}

async function revokeIfConsumed(hash: string, now: Date): Promise<RotationOutcome> {
  const consumed = await prisma.consumedRefreshToken.findUnique({
    where: { tokenHash: hash },
    select: { sessionId: true },
  });
  if (!consumed) return { kind: 'invalid' };
  // Session = token family in this design. Do NOT revoke unrelated user sessions.
  await prisma.authSession.updateMany({
    where: { id: consumed.sessionId, revokedAt: null },
    data: { revokedAt: now },
  });
  return { kind: 'replayed' };
}
