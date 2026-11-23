import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';
import { createApp } from '../../src/app.js';
import type { RefreshHandler } from '../../src/services/refresh.service.js';
import { AppError } from '../../src/utils/app-error.js';

process.env.AUTH_ACCESS_TOKEN_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_REFRESH_TOKEN_HMAC_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_CSRF_SECRET ??= randomBytes(32).toString('base64url');

const origin = 'http://localhost:5173';
const original = randomBytes(32).toString('base64url');
let server: Server;
let baseUrl: string;
const fakeRefresh: RefreshHandler = async (token) => {
  if (token !== original)
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired session');
  return {
    refreshToken: randomBytes(32).toString('base64url'),
    response: {
      accessToken: 'stub-jwt',
      tokenType: 'Bearer',
      expiresInSeconds: 600,
      user: {
        id: randomUUID(),
        email: 'test@example.com',
        displayName: 'Example',
        role: 'USER',
        avatarUrl: null,
        createdAt: new Date().toISOString(),
      },
    },
  };
};

before(async () => {
  server = createApp({ refresh: fakeRefresh }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function bootstrap() {
  const res = await fetch(`${baseUrl}/api/v1/auth/csrf`, { headers: { origin } });
  assert.equal(res.status, 200);
  const json = (await res.json()) as { data: { csrfToken: string } };
  const csrfCookie = res.headers.get('set-cookie')?.split(';')[0];
  assert.ok(csrfCookie);
  return { csrfCookie, csrfToken: json.data.csrfToken };
}

async function request(token: string, opts: { origin?: string; csrf?: boolean } = {}) {
  const csrf = await bootstrap();
  return fetch(`${baseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      origin: opts.origin ?? origin,
      cookie: `${csrf.csrfCookie}; streamlab_refresh=${token}`,
      ...(opts.csrf === false ? {} : { 'x-csrf-token': csrf.csrfToken }),
    },
  });
}

test('valid refresh issues new access JWT and HttpOnly refresh cookie', async () => {
  const res = await request(original);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { accessToken: string } };
  assert.ok(body.data.accessToken);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const cookie = res.headers.getSetCookie().join(';');
  assert.match(cookie, /streamlab_refresh=/);
  assert.match(cookie, /HttpOnly/i);
  assert.ok(!JSON.stringify(body).includes('refreshToken'));
});

test('missing/invalid refresh token returns generic 401 and clears cookie', async () => {
  const res = await request(randomBytes(32).toString('base64url'));
  assert.equal(res.status, 401);
  assert.match(res.headers.getSetCookie().join(';'), /streamlab_refresh=/);
});

test('missing CSRF and disallowed Origin return 403', async () => {
  assert.equal((await request(original, { csrf: false })).status, 403);
  assert.equal((await request(original, { origin: 'https://evil.example' })).status, 403);
});
