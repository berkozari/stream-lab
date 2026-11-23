import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';
import { createApp } from '../../src/app.js';
import type { LoginHandler } from '../../src/services/auth.service.js';
import { AppError } from '../../src/utils/app-error.js';

process.env.AUTH_ACCESS_TOKEN_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_REFRESH_TOKEN_HMAC_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_CSRF_SECRET ??= randomBytes(32).toString('base64url');

const origin = 'http://localhost:5173';
const email = 'user@example.com';
const password = 'StrongExamplePassword123!';
let server: Server;
let baseUrl = '';
const fakeLogin: LoginHandler = async (input) => {
  if (input.email !== email || input.password !== password) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  return {
    response: {
      accessToken: 'stub-login-access-token',
      tokenType: 'Bearer',
      expiresInSeconds: 600,
      user: {
        id: randomUUID(),
        email,
        displayName: 'Login User',
        role: 'USER',
        avatarUrl: null,
        createdAt: new Date().toISOString(),
      },
    },
    refreshToken: randomBytes(32).toString('base64url'),
  };
};

before(async () => {
  server = createApp({ login: fakeLogin }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function bootstrap() {
  const response = await fetch(`${baseUrl}/api/v1/auth/csrf`, { headers: { origin } });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { csrfToken: string } };
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return { cookie, token: body.data.csrfToken };
}

async function postLogin(input: {
  body?: object;
  cookie?: string;
  token?: string;
  origin?: string | null;
}) {
  return fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(input.origin === null ? {} : { origin: input.origin ?? origin }),
      ...(input.cookie ? { cookie: input.cookie } : {}),
      ...(input.token ? { 'x-csrf-token': input.token } : {}),
    },
    body: JSON.stringify(input.body ?? { email, password }),
  });
}

test('valid login returns 200, access token, and HttpOnly refresh cookie', async () => {
  const { cookie, token } = await bootstrap();
  const res = await postLogin({ cookie, token });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const response = (await res.json()) as { data: { user: { email: string }; accessToken: string } };
  assert.equal(response.data.user.email, email);
  assert.ok(response.data.accessToken);
  const cookies = res.headers.getSetCookie().join(';');
  assert.match(cookies, /streamlab_refresh=/);
  assert.match(cookies, /HttpOnly/i);
  assert.ok(!JSON.stringify(response).includes('passwordHash'));
  assert.ok(!JSON.stringify(response).includes('refreshToken'));
});

test('wrong password and nonexistent email produce identical 401 code', async () => {
  const { cookie, token } = await bootstrap();
  const wrong = await postLogin({ cookie, token, body: { email, password: 'incorrect' } });
  const absent = await postLogin({
    cookie,
    token,
    body: { email: 'nobody@example.com', password },
  });
  assert.equal(wrong.status, 401);
  assert.equal(absent.status, 401);
  const a = (await wrong.json()) as { error: { code: string; message: string } };
  const b = (await absent.json()) as { error: { code: string; message: string } };
  assert.deepEqual(a.error, b.error);
  assert.equal(a.error.code, 'INVALID_CREDENTIALS');
});

test('CSRF or Origin failures return 403 without calling login', async () => {
  const { cookie, token } = await bootstrap();
  assert.equal((await postLogin({ cookie })).status, 403);
  assert.equal((await postLogin({ cookie, token, origin: 'https://evil.example' })).status, 403);
  assert.equal((await postLogin({ cookie, token, origin: null })).status, 403);
});

test('invalid request body returns 422', async () => {
  const { cookie, token } = await bootstrap();
  assert.equal(
    (await postLogin({ cookie, token, body: { email: 'not-an-email', password: '' } })).status,
    422,
  );
});
