import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { jwtVerify } from 'jose';
import {
  createRegisterService,
  type UserWithSessionRecord,
} from '../../src/services/auth.service.js';
import type { NewUserWithSession } from '../../src/repositories/user.repository.js';
import { hashPassword, normalizeEmail, verifyPassword } from '../../src/lib/auth-security.js';

// No permanent real secrets; isolated test process only.
process.env.AUTH_ACCESS_TOKEN_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_REFRESH_TOKEN_HMAC_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_CSRF_SECRET ??= randomBytes(32).toString('base64url');

test('normalizes email without provider-specific changes', () => {
  assert.equal(normalizeEmail('  Hello+tag@Example.COM  '), 'hello+tag@example.com');
});

test('Argon2id hash never equals plaintext and is verifiable', async () => {
  const encoded = await hashPassword('A very strong example password');
  assert.match(encoded, /^\$argon2id\$/);
  assert.equal(await verifyPassword(encoded, 'A very strong example password'), true);
  assert.equal(await verifyPassword(encoded, 'wrong password'), false);
});

test('service stores only password hash + refresh digest and returns sanitized session', async () => {
  let created: Record<string, unknown> | undefined;
  const mockRepository = async (input: NewUserWithSession): Promise<UserWithSessionRecord> => {
    created = { ...input };
    return {
      id: input.userId,
      email: input.email,
      displayName: input.displayName,
      role: 'USER',
      createdAt: new Date('2026-11-23T12:00:00.000Z'),
    };
  };
  const register = createRegisterService(mockRepository);
  const result = await register({
    email: '  Creator@Example.COM ',
    password: 'Strong passphrase 1234!',
    displayName: ' Creator ',
  });
  assert.ok(created);
  assert.equal(created.email, 'creator@example.com');
  assert.equal(created.displayName, 'Creator');
  assert.notEqual(created.passwordHash, 'Strong passphrase 1234!');
  assert.equal(typeof created.refreshTokenHash, 'string');
  assert.notEqual(created.refreshTokenHash, result.refreshToken);
  assert.ok((created.refreshTokenHash as string).length === 64);
  assert.equal(result.response.user.email, 'creator@example.com');
  assert.equal(result.response.user.avatarUrl, null);
  assert.equal(result.response.expiresInSeconds, 600);
  const json = JSON.stringify(result.response);
  assert.ok(!json.includes('passwordHash'));
  assert.ok(!json.includes('refreshToken'));
  assert.ok(!json.includes('Strong passphrase'));

  const { payload } = await jwtVerify(
    result.response.accessToken,
    new TextEncoder().encode(process.env.AUTH_ACCESS_TOKEN_SECRET!),
    {
      algorithms: ['HS256'],
      audience: 'streamlab-web',
      issuer: 'streamlab-api',
    },
  );
  assert.equal(payload.sub, created.userId);
  assert.equal(payload.sid, created.sessionId);
  assert.equal(payload.typ, 'access');
});

test('separate users receive distinct JWTs', async () => {
  const register = createRegisterService(async (input) => ({
    id: input.userId,
    email: input.email,
    displayName: input.displayName,
    role: 'USER',
    createdAt: new Date(),
  }));
  const input = {
    email: `${randomUUID()}@example.com`,
    password: 'Long random test password!',
    displayName: 'Test',
  };
  const first = await register(input);
  const second = await register(input);
  assert.notEqual(first.response.accessToken, second.response.accessToken);
  assert.notEqual(first.refreshToken, second.refreshToken);
});
