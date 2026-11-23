import type { RequestHandler } from 'express';
import type { AuthPrincipal } from '../types/auth.js';
import { AppError } from '../utils/app-error.js';

/** Always use a role resolved from PostgreSQL, not an unverified JWT claim. */
export function requireRoles(...allowed: Array<AuthPrincipal['user']['role']>): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }
    if (!allowed.includes(req.auth.user.role)) {
      next(new AppError(403, 'FORBIDDEN', 'Insufficient permissions'));
      return;
    }
    next();
  };
}

/** Reusable policy helper for future video-management endpoints (not routed yet). */
export function assertCanManageVideo(principal: AuthPrincipal, videoOwnerId: string): void {
  if (principal.user.role !== 'ADMIN' && principal.userId !== videoOwnerId) {
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
}
