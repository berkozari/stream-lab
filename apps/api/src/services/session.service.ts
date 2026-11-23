import { digestRefreshToken } from '../lib/auth-security.js';
import { revokeSessionByRefreshHash } from '../repositories/session.repository.js';

export type RevokeSession = (tokenHash: string) => Promise<void>;
export type LogoutHandler = (refreshToken: string | undefined) => Promise<void>;

export function createLogoutService(
  revoke: RevokeSession = revokeSessionByRefreshHash,
): LogoutHandler {
  return async (refreshToken) => {
    // Logout is intentionally idempotent; missing/expired cookies still result in 204.
    if (!refreshToken || !/^[A-Za-z0-9_-]{40,100}$/.test(refreshToken)) return;
    await revoke(digestRefreshToken(refreshToken));
  };
}

export const logoutSession = createLogoutService();
