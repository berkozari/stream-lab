import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';
import { createApp } from '../../src/app.js';
import { createRequireAuth } from '../../src/middlewares/auth.middleware.js';
import { signAccessToken } from '../../src/lib/auth-security.js';

process.env.AUTH_ACCESS_TOKEN_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_REFRESH_TOKEN_HMAC_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_CSRF_SECRET ??= randomBytes(32).toString('base64url');

const origin = 'http://localhost:5173';
const userId = randomUUID();
const sessionId = randomUUID();
const refreshToken = randomBytes(32).toString('base64url');
let active = true;
let server: Server;
let baseUrl = '';
let accessToken = '';
const user = {
  id: userId,
  email: 'streamlab@example.com',
  displayName: 'StreamLab Test',
  role: 'USER' as const,
  createdAt: new Date(),
};

before(async () => {
  const app = createApp({
    authenticate: createRequireAuth(async (sid, uid) =>
      active && sid === sessionId && uid === userId ? { id: sessionId, user } : null,
    ),
    logout: async (token) => {
      if (token === refreshToken) active = false;
    },
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
  accessToken = await signAccessToken(userId, sessionId);
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function getCsrf() {
  const response = await fetch(`${baseUrl}/api/v1/auth/csrf`, { headers: { origin } });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { csrfToken: string } };
  const cookiePair = response.headers
    .getSetCookie()
    .find((v) => v.startsWith('streamlab_csrf_context='))
    ?.split(';')[0];
  assert.ok(cookiePair);
  return { cookiePair, token: body.data.csrfToken };
}

test('protected /users/me rejects missing and malformed JWT', async () => {
  assert.equal((await fetch(`${baseUrl}/api/v1/users/me`)).status, 401);
  assert.equal(
    (
      await fetch(`${baseUrl}/api/v1/users/me`, {
        headers: { Authorization: 'Bearer invalid.jwt' },
      })
    ).status,
    401,
  );
});

test('valid access JWT returns only public user projection', async () => {
  const response = await fetch(`${baseUrl}/api/v1/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = (await response.json()) as { data: { id: string; role: string } };
  assert.equal(body.data.id, userId);
  assert.equal(body.data.role, 'USER');
  assert.ok(!JSON.stringify(body).includes('passwordHash'));
});

test('logout requires Origin + CSRF, clears cookie and invalidates access JWT', async () => {
  const csrf = await getCsrf();
  const url = `${baseUrl}/api/v1/auth/logout`;
  assert.equal(
    (
      await fetch(url, {
        method: 'POST',
        headers: { origin, cookie: `${csrf.cookiePair}; streamlab_refresh=${refreshToken}` },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(url, {
        method: 'POST',
        headers: {
          origin: 'https://evil.example',
          cookie: `${csrf.cookiePair}; streamlab_refresh=${refreshToken}`,
          'x-csrf-token': csrf.token,
        },
      })
    ).status,
    403,
  );
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      origin,
      cookie: `${csrf.cookiePair}; streamlab_refresh=${refreshToken}`,
      'x-csrf-token': csrf.token,
    },
  });
  assert.equal(response.status, 204);

  const refreshSetCookie = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith('streamlab_refresh='));

  assert.ok(refreshSetCookie, 'Refresh cookie should be cleared');

  // Cookie value must be empty.
  assert.match(refreshSetCookie, /^streamlab_refresh=;/);

  // Cookie must retain its security attributes.
  assert.match(refreshSetCookie, /HttpOnly/i);
  assert.match(refreshSetCookie, /Path=\/api\/v1\/auth/i);

  // The expiration date must be in the past.
  const expires = refreshSetCookie.match(/Expires=([^;]+)/i)?.[1];

  assert.ok(expires, 'Refresh cookie expiration is missing');

  assert.ok(Date.parse(expires) <= Date.now(), 'Refresh cookie must be expired');

  assert.equal(
    (
      await fetch(`${baseUrl}/api/v1/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    ).status,
    401,
  );
});
