import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { jwtVerify } from 'jose';
import { createLoginService, type LoginDependencies } from '../../src/services/auth.service.js';
import type { LoginUserRecord } from '../../src/repositories/user.repository.js';
import { digestRefreshToken, hashPassword } from '../../src/lib/auth-security.js';
import { AppError } from '../../src/utils/app-error.js';

process.env.AUTH_ACCESS_TOKEN_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_REFRESH_TOKEN_HMAC_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_CSRF_SECRET ??= randomBytes(32).toString('base64url');

const password = 'CorrectHorseBatteryStaple!2026';
const now = new Date('2026-11-23T12:00:00.000Z');

async function fixture(): Promise<LoginUserRecord> {
  return {
    id: randomUUID(),
    email: 'creator@example.com',
    passwordHash: await hashPassword(password),
    displayName: 'Creator',
    role: 'USER',
    createdAt: now,
  };
}

test('login creates hashed session and returns sanitized JWT response', async () => {
  const user = await fixture();
  let stored: Parameters<LoginDependencies['persistSession']>[0] | undefined;
  const login = createLoginService({
    findUserByEmail: async (email) => {
      assert.equal(email, 'creator@example.com');
      return user;
    },
    persistSession: async (session) => {
      stored = session;
    },
  });
  const result = await login({ email: ' Creator@Example.com ', password });
  assert.ok(stored);
  assert.equal(stored.userId, user.id);
  assert.equal(stored.refreshTokenHash, digestRefreshToken(result.refreshToken));
  assert.notEqual(stored.refreshTokenHash, result.refreshToken);
  assert.equal(result.response.expiresInSeconds, 600);
  assert.equal(result.response.user.email, user.email);
  assert.equal(result.response.user.avatarUrl, null);
  assert.ok(!JSON.stringify(result.response).includes('passwordHash'));
  assert.ok(!JSON.stringify(result.response).includes('refreshToken'));
  const verified = await jwtVerify(
    result.response.accessToken,
    new TextEncoder().encode(process.env.AUTH_ACCESS_TOKEN_SECRET!),
    { algorithms: ['HS256'], audience: 'streamlab-web', issuer: 'streamlab-api' },
  );
  assert.equal(verified.payload.sub, user.id);
  assert.equal(verified.payload.sid, stored.id);
});

test('wrong password does not persist session and returns generic 401', async () => {
  const user = await fixture();
  let persisted = false;
  const login = createLoginService({
    findUserByEmail: async () => user,
    persistSession: async () => {
      persisted = true;
    },
  });
  await assert.rejects(
    login({ email: user.email, password: 'incorrect password' }),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 401 && error.code === 'INVALID_CREDENTIALS',
  );
  assert.equal(persisted, false);
});

test('unknown email performs a dummy hash verification and returns identical 401', async () => {
  let calls = 0;
  let persisted = false;
  const login = createLoginService({
    findUserByEmail: async () => null,
    verify: async () => {
      calls += 1;
      return false;
    },
    persistSession: async () => {
      persisted = true;
    },
  });
  await assert.rejects(
    login({ email: 'nobody@example.com', password }),
    (error: unknown) =>
      error instanceof AppError && error.statusCode === 401 && error.code === 'INVALID_CREDENTIALS',
  );
  assert.equal(calls, 1);
  assert.equal(persisted, false);
});
