import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { jwtVerify } from 'jose';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  csrfTokenForContext,
  digestRefreshToken,
  equalCsrfToken,
  newCsrfContext,
  newRefreshToken,
  signAccessToken,
} from '../../src/lib/auth-security.js';
import { getAuthSecrets } from '../../src/config/auth-env.js';

process.env.AUTH_ACCESS_TOKEN_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_REFRESH_TOKEN_HMAC_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_CSRF_SECRET ??= randomBytes(32).toString('base64url');

test('access JWT has constrained issuer, audience, lifetime and distinct jti', async () => {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const first = await signAccessToken(userId, sessionId);
  const second = await signAccessToken(userId, sessionId);
  assert.notEqual(first, second);

  const secret = new TextEncoder().encode(getAuthSecrets().AUTH_ACCESS_TOKEN_SECRET);
  const { payload, protectedHeader } = await jwtVerify(first, secret, {
    algorithms: ['HS256'],
    issuer: 'streamlab-api',
    audience: 'streamlab-web',
  });
  assert.equal(protectedHeader.alg, 'HS256');
  assert.equal(payload.typ, 'access');
  assert.equal(payload.sub, userId);
  assert.equal(payload.sid, sessionId);
  assert.equal(typeof payload.jti, 'string');
  assert.ok(payload.jti);
  const ttl = (payload.exp ?? 0) - (payload.iat ?? 0);
  assert.ok(ttl >= ACCESS_TOKEN_TTL_SECONDS && ttl <= ACCESS_TOKEN_TTL_SECONDS + 1);
  assert.equal(JSON.stringify(payload).includes('passwordHash'), false);
  assert.equal(JSON.stringify(payload).includes('refreshToken'), false);
});

test('refresh token digests are deterministic HMACs without plaintext storage', () => {
  const first = newRefreshToken();
  const second = newRefreshToken();
  assert.match(first, /^[A-Za-z0-9_-]{40,100}$/);
  assert.notEqual(first, second);
  const hash = digestRefreshToken(first);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(digestRefreshToken(first), hash);
  assert.notEqual(digestRefreshToken(second), hash);
  assert.equal(hash.includes(first), false);
});

test('CSRF tokens are bound to their cookie context and reject tampering', () => {
  const firstContext = newCsrfContext();
  const secondContext = newCsrfContext();
  const token = csrfTokenForContext(firstContext);
  assert.ok(equalCsrfToken(firstContext, token));
  assert.equal(equalCsrfToken(secondContext, token), false);
  assert.equal(equalCsrfToken(firstContext, `${token}x`), false);
  assert.equal(equalCsrfToken(firstContext, `x${token.slice(1)}`), false);
  assert.equal(equalCsrfToken(firstContext, ''), false);
});
