import { prisma } from '../config/database.js';

export type NewUserWithSession = {
  userId: string;
  sessionId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  refreshTokenHash: string;
  expiresAt: Date;
};

/** Nested create is atomic: no account without its initial session on success. */
export async function createUserWithSession(input: NewUserWithSession) {
  return prisma.user.create({
    data: {
      id: input.userId,
      email: input.email,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      role: 'USER',
      sessions: {
        create: {
          id: input.sessionId,
          refreshTokenHash: input.refreshTokenHash,
          expiresAt: input.expiresAt,
        },
      },
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      createdAt: true,
    },
  });
}

/** Minimal user projection for password verification; never send passwordHash over HTTP. */
export async function findLoginUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      displayName: true,
      role: true,
      createdAt: true,
    },
  });
}

export type LoginUserRecord = NonNullable<Awaited<ReturnType<typeof findLoginUserByEmail>>>;
