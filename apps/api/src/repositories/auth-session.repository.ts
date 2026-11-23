import { prisma } from '../config/database.js';

export type NewAuthSession = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
};

/** Persists only a digest. Never put raw refresh tokens into PostgreSQL. */
export async function createAuthSession(input: NewAuthSession): Promise<void> {
  await prisma.authSession.create({
    data: {
      id: input.id,
      userId: input.userId,
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: input.expiresAt,
    },
  });
}
