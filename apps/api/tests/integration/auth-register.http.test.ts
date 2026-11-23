import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { createApp } from '../../src/app.js';
import { AppError } from '../../src/utils/app-error.js';
import type { RegisterHandler } from '../../src/services/auth.service.js';

process.env.AUTH_ACCESS_TOKEN_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_REFRESH_TOKEN_HMAC_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_CSRF_SECRET ??= randomBytes(32).toString('base64url');

let server: Server;
let baseUrl = '';
let capturedEmail = '';
const origin = 'http://localhost:5173';
const fakeRegister: RegisterHandler = async (input) => {
  capturedEmail = input.email;
  if (input.email === 'taken@example.com') {
    throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email is already registered');
  }
  return {
    response: {
      accessToken: 'stub-access-token',
      tokenType: 'Bearer',
      expiresInSeconds: 600,
      user: {
        id: randomUUID(),
        email: input.email,
        displayName: input.displayName,
        role: 'USER',
        avatarUrl: null,
        createdAt: new Date().toISOString(),
      },
    },
    refreshToken: randomBytes(32).toString('base64url'),
  };
};

before(async () => {
  server = createApp({ register: fakeRegister }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function csrfBootstrap() {
  const response = await fetch(`${baseUrl}/api/v1/auth/csrf`, { headers: { origin } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = (await response.json()) as { success: boolean; data: { csrfToken: string } };
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return { cookie, token: body.data.csrfToken };
}

async function postRegister(args: {
  body?: object;
  token?: string;
  cookie?: string;
  origin?: string | null;
}) {
  return fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(args.origin === null ? {} : { origin: args.origin ?? origin }),
      ...(args.token ? { 'x-csrf-token': args.token } : {}),
      ...(args.cookie ? { cookie: args.cookie } : {}),
    },
    body: JSON.stringify(
      args.body ?? {
        email: 'test@example.com',
        password: 'ValidTestPassword123!',
        displayName: 'Test Creator',
      },
    ),
  });
}

test('csrf bootstrap issues token and HttpOnly cookie', async () => {
  const { cookie, token } = await csrfBootstrap();
  assert.ok(cookie.startsWith('streamlab_csrf_context='));
  assert.ok(token.length >= 32);
});

test('valid registration returns 201 + refresh cookie with no hash', async () => {
  const { cookie, token } = await csrfBootstrap();
  const response = await postRegister({ cookie, token });
  assert.equal(response.status, 201);
  const body = (await response.json()) as {
    success: boolean;
    data: { accessToken: string; user: { email: string } };
  };
  assert.equal(body.success, true);
  assert.equal(body.data.user.email, 'test@example.com');
  assert.equal(capturedEmail, 'test@example.com');
  const cookies = response.headers.getSetCookie().join(';');
  assert.match(cookies, /streamlab_refresh=/);
  assert.match(cookies, /HttpOnly/i);
  assert.ok(!JSON.stringify(body).includes('passwordHash'));
  assert.ok(!JSON.stringify(body).includes('refreshToken'));
});

test('missing CSRF and forged Origin are rejected', async () => {
  const { cookie, token } = await csrfBootstrap();
  assert.equal((await postRegister({ cookie })).status, 403);
  assert.equal((await postRegister({ cookie, token, origin: 'https://evil.example' })).status, 403);
  assert.equal((await postRegister({ cookie, token, origin: null })).status, 403);
});

test('weak password rejected with 422', async () => {
  const { cookie, token } = await csrfBootstrap();
  const response = await postRegister({
    cookie,
    token,
    body: { email: 'x@example.com', password: 'weak', displayName: 'X' },
  });
  assert.equal(response.status, 422);
});

test('duplicate account returns a safe 409', async () => {
  const { cookie, token } = await csrfBootstrap();
  const response = await postRegister({
    cookie,
    token,
    body: { email: 'taken@example.com', password: 'StrongPassword123!', displayName: 'Taken' },
  });
  assert.equal(response.status, 409);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'EMAIL_ALREADY_EXISTS');
});
