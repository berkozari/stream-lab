import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createRefreshService } from '../../src/services/refresh.service.js';
import { AppError } from '../../src/utils/app-error.js';

process.env.AUTH_ACCESS_TOKEN_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_REFRESH_TOKEN_HMAC_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_CSRF_SECRET ??= randomBytes(32).toString('base64url');

const validToken = randomBytes(32).toString('base64url');

const fakeUser = {
  id: randomUUID(),
  email: 'refresh@example.com',
  displayName: 'Refresh Test',
  role: 'USER' as const,
  createdAt: new Date(),
};

test('successful refresh replaces token hash and issues a JWT', async () => {
  let storedOldHash = '';
  let storedNextHash = '';
  const refresh = createRefreshService(async (oldHash, newHash, expires) => {
    storedOldHash = oldHash;
    storedNextHash = newHash;
    assert.ok(expires > new Date());
    return { kind: 'rotated', sessionId: randomUUID(), user: fakeUser };
  });
  const result = await refresh(validToken);
  assert.equal(result.response.user.email, fakeUser.email);
  assert.equal(result.response.tokenType, 'Bearer');
  assert.ok(result.response.accessToken);
  assert.ok(result.refreshToken);
  assert.notEqual(result.refreshToken, validToken);
  assert.notEqual(storedOldHash, storedNextHash);
  assert.ok(!JSON.stringify(result.response).includes('refreshToken'));
});

test('consumed or unknown refresh token returns the same 401 error', async () => {
  for (const outcome of [{ kind: 'replayed' }, { kind: 'invalid' }] as const) {
    const refresh = createRefreshService(async () => outcome);
    await assert.rejects(refresh(validToken), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 401);
      assert.equal(error.code, 'INVALID_REFRESH_TOKEN');
      return true;
    });
  }
});

test('malformed refresh token is rejected without database query', async () => {
  let called = false;
  const refresh = createRefreshService(async () => {
    called = true;
    return { kind: 'invalid' };
  });
  await assert.rejects(refresh('bad'), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 401);
    return true;
  });
  assert.equal(called, false);
});
