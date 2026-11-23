import { prisma } from '../config/database.js';

/** The database is authoritative for both revocation and current user role. */
export async function findActiveSessionIdentity(sessionId: string, userId: string) {
  return prisma.authSession.findFirst({
    where: {
      id: sessionId,
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
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
}

export type ActiveSessionIdentity = NonNullable<
  Awaited<ReturnType<typeof findActiveSessionIdentity>>
>;
