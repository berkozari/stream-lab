import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createLogoutService } from '../../src/services/session.service.js';
import { digestRefreshToken } from '../../src/lib/auth-security.js';
import { assertCanManageVideo } from '../../src/middlewares/authorize.middleware.js';
import type { AuthPrincipal } from '../../src/types/auth.js';
import { AppError } from '../../src/utils/app-error.js';

process.env.AUTH_ACCESS_TOKEN_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_REFRESH_TOKEN_HMAC_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_CSRF_SECRET ??= randomBytes(32).toString('base64url');

const userId = randomUUID();
const principal: AuthPrincipal = {
  userId,
  sessionId: randomUUID(),
  user: {
    id: userId,
    displayName: 'Viewer',
    email: 'viewer@example.com',
    role: 'USER',
    avatarUrl: null,
    createdAt: new Date().toISOString(),
  },
};

test('logout revokes only the digest for a valid refresh token', async () => {
  const token = randomBytes(32).toString('base64url');
  const saved: string[] = [];
  const logout = createLogoutService(async (hash) => {
    saved.push(hash);
  });
  await logout(token);
  assert.deepEqual(saved, [digestRefreshToken(token)]);
  await logout(undefined);
  await logout('malformed');
  assert.equal(saved.length, 1);
});

test('video management policy rejects non-owners, allows owner or admin', () => {
  assert.doesNotThrow(() => assertCanManageVideo(principal, userId));
  assert.throws(
    () => assertCanManageVideo(principal, randomUUID()),
    (error: unknown) => error instanceof AppError && error.statusCode === 403,
  );
  const admin: AuthPrincipal = { ...principal, user: { ...principal.user, role: 'ADMIN' } };
  assert.doesNotThrow(() => assertCanManageVideo(admin, randomUUID()));
});
