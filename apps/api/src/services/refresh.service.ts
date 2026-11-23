import type { AuthSessionResponse } from '@streamlab/contracts';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_COOKIE_TTL_MS,
  digestRefreshToken,
  newRefreshToken,
  signAccessToken,
} from '../lib/auth-security.js';
import {
  rotateRefreshSession,
  type RotationOutcome,
} from '../repositories/refresh-token.repository.js';
import { AppError } from '../utils/app-error.js';

export type RefreshResult = { response: AuthSessionResponse; refreshToken: string };
export type RefreshHandler = (refreshToken: string) => Promise<RefreshResult>;
export type RotateDependency = (
  oldHash: string,
  nextHash: string,
  nextExpiresAt: Date,
) => Promise<RotationOutcome>;

export function createRefreshService(
  rotate: RotateDependency = rotateRefreshSession,
): RefreshHandler {
  return async (presentedToken) => {
    // Reject malformed cookies before reaching the DB, without logging the token.
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(presentedToken)) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired session');
    }

    const nextToken = newRefreshToken();
    const outcome = await rotate(
      digestRefreshToken(presentedToken),
      digestRefreshToken(nextToken),
      new Date(Date.now() + REFRESH_COOKIE_TTL_MS),
    );
    if (outcome.kind !== 'rotated') {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired session');
    }

    const { user, sessionId } = outcome;
    const accessToken = await signAccessToken(user.id, sessionId);
    return {
      refreshToken: nextToken,
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
    };
  };
}

export const refreshSession = createRefreshService();
