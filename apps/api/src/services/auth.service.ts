import { randomUUID } from 'node:crypto';
import type { RegisterRequest, LoginRequest, AuthSessionResponse } from '@streamlab/contracts';
import { Prisma } from '../generated/prisma/client.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_COOKIE_TTL_MS,
  digestRefreshToken,
  hashPassword,
  newRefreshToken,
  normalizeEmail,
  signAccessToken,
  verifyPassword,
} from '../lib/auth-security.js';
import {
  createUserWithSession,
  findLoginUserByEmail,
  type NewUserWithSession,
  type LoginUserRecord,
} from '../repositories/user.repository.js';
import { createAuthSession, type NewAuthSession } from '../repositories/auth-session.repository.js';
import { AppError } from '../utils/app-error.js';

export type RegisterResult = { response: AuthSessionResponse; refreshToken: string };
export type UserWithSessionRecord = {
  id: string;
  email: string;
  displayName: string;
  role: 'USER' | 'ADMIN';
  createdAt: Date;
};
export type RegisterRepository = (input: NewUserWithSession) => Promise<UserWithSessionRecord>;

export function createRegisterService(repository: RegisterRepository = createUserWithSession) {
  return async function register(input: RegisterRequest): Promise<RegisterResult> {
    const userId = randomUUID();
    const sessionId = randomUUID();
    const refreshToken = newRefreshToken();
    const passwordHash = await hashPassword(input.password);
    const accessToken = await signAccessToken(userId, sessionId);

    let user: UserWithSessionRecord;
    try {
      user = await repository({
        userId,
        sessionId,
        email: normalizeEmail(input.email),
        displayName: input.displayName.trim(),
        passwordHash,
        refreshTokenHash: digestRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_COOKIE_TTL_MS),
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email is already registered');
      }
      throw error;
    }

    return {
      response: {
        accessToken,
        tokenType: 'Bearer',
        expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          avatarUrl: null,
          createdAt: user.createdAt.toISOString(),
        },
      },
      refreshToken,
    };
  };
}

export const registerUser = createRegisterService();
export type RegisterHandler = ReturnType<typeof createRegisterService>;

// Precomputed, intentionally unassociated Argon2id hash for accounts that do not exist.
// Verifying it helps avoid a fast-fail user-enumeration timing oracle.
const NONEXISTENT_USER_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$Fly9oBKzlBEZdblghgR4Jg$Im3KuBu8OfViMK1kRyrNQYhbL6X1NnvebQLJLTAGz4k';

export type LoginDependencies = {
  findUserByEmail: (email: string) => Promise<LoginUserRecord | null>;
  persistSession: (input: NewAuthSession) => Promise<void>;
  verify: (hash: string, password: string) => Promise<boolean>;
};

export function createLoginService(overrides: Partial<LoginDependencies> = {}) {
  const dependencies: LoginDependencies = {
    findUserByEmail: findLoginUserByEmail,
    persistSession: createAuthSession,
    verify: verifyPassword,
    ...overrides,
  };

  return async function login(input: LoginRequest): Promise<RegisterResult> {
    const email = normalizeEmail(input.email);
    const user = await dependencies.findUserByEmail(email);
    // Always perform a password hash verification, even for missing accounts.
    const validPassword = await dependencies.verify(
      user?.passwordHash ?? NONEXISTENT_USER_PASSWORD_HASH,
      input.password,
    );
    if (!user || !validPassword) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const sessionId = randomUUID();
    const refreshToken = newRefreshToken();
    const accessToken = await signAccessToken(user.id, sessionId);
    await dependencies.persistSession({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: digestRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_COOKIE_TTL_MS),
    });

    return {
      response: {
        accessToken,
        tokenType: 'Bearer',
        expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          avatarUrl: null,
          createdAt: user.createdAt.toISOString(),
        },
      },
      refreshToken,
    };
  };
}

export const loginUser = createLoginService();
export type LoginHandler = ReturnType<typeof createLoginService>;
