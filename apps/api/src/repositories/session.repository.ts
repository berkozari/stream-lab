import { prisma } from '../config/database.js';

/** Revoke the current token's session only; do not affect other device sessions. */
export async function revokeSessionByRefreshHash(tokenHash: string): Promise<void> {
  await prisma.authSession.updateMany({
    where: { refreshTokenHash: tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
