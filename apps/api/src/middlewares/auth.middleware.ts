import type { RequestHandler } from 'express';
import { jwtVerify, type JWTPayload } from 'jose';
import { getAuthSecrets } from '../config/auth-env.js';
import {
  findActiveSessionIdentity,
  type ActiveSessionIdentity,
} from '../repositories/current-user.repository.js';
import { AppError } from '../utils/app-error.js';

export type ActiveSessionLookup = (
  sessionId: string,
  userId: string,
) => Promise<ActiveSessionIdentity | null>;

const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'Authentication required');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Verify signature/claims AND fetch an active session for immediate logout invalidation. */
export function createRequireAuth(
  lookup: ActiveSessionLookup = findActiveSessionIdentity,
): RequestHandler {
  return async (req, _res, next) => {
    const authorization = req.get('authorization');
    const match = authorization?.match(/^Bearer ([^\s]+)$/i);
    if (!match?.[1]) {
      next(unauthorized());
      return;
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(
        match[1],
        new TextEncoder().encode(getAuthSecrets().AUTH_ACCESS_TOKEN_SECRET),
        { algorithms: ['HS256'], issuer: 'streamlab-api', audience: 'streamlab-web' },
      ));
    } catch {
      next(unauthorized());
      return;
    }

    try {
      if (
        payload.typ !== 'access' ||
        typeof payload.sub !== 'string' ||
        !uuidPattern.test(payload.sub) ||
        typeof payload.sid !== 'string' ||
        !uuidPattern.test(payload.sid)
      ) {
        next(unauthorized());
        return;
      }

      const active = await lookup(payload.sid, payload.sub);
      if (!active || active.user.id !== payload.sub) {
        next(unauthorized());
        return;
      }

      req.auth = {
        userId: active.user.id,
        sessionId: active.id,
        user: {
          id: active.user.id,
          email: active.user.email,
          displayName: active.user.displayName,
          role: active.user.role,
          avatarUrl: null,
          createdAt: active.user.createdAt.toISOString(),
        },
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireAuth = createRequireAuth();
