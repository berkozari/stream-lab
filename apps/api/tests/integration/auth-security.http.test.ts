import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';
import express from 'express';
import { SignJWT } from 'jose';
import { createApp } from '../../src/app.js';
import { allowedOrigins } from '../../src/config/env.js';
import { getAuthSecrets } from '../../src/config/auth-env.js';
import { signAccessToken, newRefreshToken } from '../../src/lib/auth-security.js';
import { createRequireAuth } from '../../src/middlewares/auth.middleware.js';
import { requireRoles } from '../../src/middlewares/authorize.middleware.js';
import { errorMiddleware } from '../../src/middlewares/error.middleware.js';
import { AppError } from '../../src/utils/app-error.js';

process.env.AUTH_ACCESS_TOKEN_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_REFRESH_TOKEN_HMAC_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_CSRF_SECRET ??= randomBytes(32).toString('base64url');

const origin = [...allowedOrigins][0] ?? 'http://localhost:5173';
const wrongOrigin = 'https://untrusted-origin.invalid';
const userId = randomUUID();
const sessionId = randomUUID();
const refreshToken = newRefreshToken();
let active = true;
let currentRole: 'USER' | 'ADMIN' = 'USER';
let lookupCalls = 0;
let authHandlerCalls = 0;
let apiServer: Server;
let policyServer: Server;
let apiBase = '';
let policyBase = '';
let validToken = '';

const lookup = async (sid: string, uid: string) => {
  lookupCalls += 1;
  if (!active || sid !== sessionId || uid !== userId) return null;
  return {
    id: sessionId,
    user: {
      id: userId,
      email: 'security@example.invalid',
      displayName: 'Security Test',
      role: currentRole,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  };
};

const authResponse = () => ({
  refreshToken,
  response: {
    accessToken: 'stub-jwt',
    tokenType: 'Bearer' as const,
    expiresInSeconds: 600,
    user: {
      id: userId,
      email: 'security@example.invalid',
      displayName: 'Security Test',
      role: 'USER' as const,
      avatarUrl: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  },
});

const countHandler = async () => {
  authHandlerCalls += 1;
  return authResponse();
};

async function startServer(app: ReturnType<typeof createApp>): Promise<[Server, string]> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return [server, `http://127.0.0.1:${address.port}`];
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

before(async () => {
  [apiServer, apiBase] = await startServer(
    createApp({
      authenticate: createRequireAuth(lookup),
      login: countHandler,
      register: countHandler,
      refresh: async () => countHandler(),
      logout: async () => {
        authHandlerCalls += 1;
      },
    }),
  );
  const policy = express();
  policy.get('/admin', createRequireAuth(lookup), requireRoles('ADMIN'), (_req, res) => {
    res.status(200).json({ allowed: true });
  });
  policy.use(errorMiddleware);
  [policyServer, policyBase] = await startServer(policy);
  validToken = await signAccessToken(userId, sessionId);
});

after(async () => {
  await closeServer(apiServer);
  await closeServer(policyServer);
});

function authorization(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

async function forgedToken(
  options: {
    subject?: string;
    sid?: string;
    typ?: string;
    secret?: string;
    issuer?: string;
    audience?: string;
    expiresAt?: number;
    notBefore?: number;
  } = {},
): Promise<string> {
  const token = new SignJWT({ sid: options.sid ?? sessionId, typ: options.typ ?? 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(options.subject ?? userId)
    .setIssuer(options.issuer ?? 'streamlab-api')
    .setAudience(options.audience ?? 'streamlab-web')
    .setIssuedAt()
    .setExpirationTime(options.expiresAt ?? Math.floor(Date.now() / 1000) + 600);
  if (options.notBefore !== undefined) token.setNotBefore(options.notBefore);
  return token.sign(
    new TextEncoder().encode(options.secret ?? getAuthSecrets().AUTH_ACCESS_TOKEN_SECRET),
  );
}

async function getMe(token?: string): Promise<Response> {
  return fetch(`${apiBase}/api/v1/users/me`, token ? { headers: authorization(token) } : {});
}

async function csrfBootstrap() {
  const response = await fetch(`${apiBase}/api/v1/auth/csrf`, { headers: { origin } });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { csrfToken: string } };
  const pair = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('streamlab_csrf_context='))
    ?.split(';')[0];
  assert.ok(pair);
  return { pair, token: body.data.csrfToken };
}

function mutation(
  endpoint: string,
  csrf: { pair: string; token: string },
  extra: { origin?: string | null; csrfToken?: string | null; cookie?: string | null } = {},
) {
  const actualOrigin = extra.origin === undefined ? origin : extra.origin;
  const actualToken = extra.csrfToken === undefined ? csrf.token : extra.csrfToken;
  const actualCookie = extra.cookie === undefined ? csrf.pair : extra.cookie;
  const body =
    endpoint === 'register'
      ? {
          email: 'security@example.invalid',
          displayName: 'Security Test',
          password: 'SecurePassword123!',
        }
      : { email: 'security@example.invalid', password: 'SecurePassword123!' };
  return fetch(`${apiBase}/api/v1/auth/${endpoint}`, {
    method: 'POST',
    headers: {
      ...(actualOrigin === null ? {} : { origin: actualOrigin }),
      ...(actualToken === null ? {} : { 'x-csrf-token': actualToken }),
      ...(actualCookie === null ? {} : { cookie: actualCookie }),
      ...(endpoint === 'login' || endpoint === 'register'
        ? { 'content-type': 'application/json' }
        : {}),
    },
    ...(endpoint === 'login' || endpoint === 'register' ? { body: JSON.stringify(body) } : {}),
  });
}

test('rejects altered signature, issuer, audience, expiry and future not-before', async () => {
  const now = Math.floor(Date.now() / 1000);
  const [head, body, signature] = validToken.split('.');
  assert.ok(head && body && signature);
  const changedFirstChar = signature[0] === 'A' ? 'B' : 'A';
  const altered = `${head}.${body}.${changedFirstChar}${signature.slice(1)}`;
  const candidates = [
    await forgedToken({ secret: randomBytes(32).toString('base64url') }),
    await forgedToken({ issuer: 'forged-issuer' }),
    await forgedToken({ audience: 'forged-audience' }),
    await forgedToken({ expiresAt: now - 60 }),
    await forgedToken({ notBefore: now + 120 }),
    altered,
  ];
  lookupCalls = 0;
  for (const token of candidates) {
    const response = await getMe(token);
    assert.equal(response.status, 401);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'UNAUTHORIZED');
  }
  assert.equal(lookupCalls, 0, 'Invalid JWTs must not reach session lookup');
});

test('rejects invalid token type, subject and session binding', async () => {
  const candidates = [
    await forgedToken({ typ: 'refresh' }),
    await forgedToken({ subject: 'not-a-uuid' }),
    await forgedToken({ sid: 'not-a-uuid' }),
    await forgedToken({ subject: randomUUID() }),
    await forgedToken({ sid: randomUUID() }),
  ];
  for (const token of candidates) {
    assert.equal((await getMe(token)).status, 401);
  }
});

test('session revocation is authoritative for signed, unexpired JWTs', async () => {
  assert.equal((await getMe(validToken)).status, 200);
  active = false;
  try {
    assert.equal((await getMe(validToken)).status, 401);
  } finally {
    active = true;
  }
});

test('RBAC trusts server-resolved role rather than client-supplied role', async () => {
  const clientClaimsAdmin = await new SignJWT({ sid: sessionId, typ: 'access', role: 'ADMIN' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer('streamlab-api')
    .setAudience('streamlab-web')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(getAuthSecrets().AUTH_ACCESS_TOKEN_SECRET));

  currentRole = 'USER';
  assert.equal(
    (await fetch(`${policyBase}/admin`, { headers: authorization(clientClaimsAdmin) })).status,
    403,
  );
  currentRole = 'ADMIN';
  try {
    assert.equal(
      (await fetch(`${policyBase}/admin`, { headers: authorization(validToken) })).status,
      200,
    );
  } finally {
    currentRole = 'USER';
  }
});

test('all auth mutations require trusted Origin and matching CSRF context', async () => {
  const csrf = await csrfBootstrap();
  for (const endpoint of ['register', 'login', 'refresh', 'logout']) {
    const beforeCount = authHandlerCalls;
    const cases = [
      { origin: null },
      { origin: wrongOrigin },
      { csrfToken: null },
      { csrfToken: 'tampered-token' },
      { cookie: null },
    ];
    for (const headers of cases) {
      const response = await mutation(endpoint, csrf, headers);
      assert.equal(response.status, 403, `${endpoint} must reject invalid CSRF/Origin`);
    }
    const anotherContext = await csrfBootstrap();
    assert.equal((await mutation(endpoint, csrf, { cookie: anotherContext.pair })).status, 403);
    assert.equal(authHandlerCalls, beforeCount, `Rejected ${endpoint} must not hit handler`);
  }
});

test('successful login sets scoped HttpOnly cookie and disables response caching', async () => {
  const csrf = await csrfBootstrap();
  const response = await mutation('login', csrf);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('streamlab_refresh='));
  assert.ok(cookie);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Path=\/api\/v1\/auth/i);
  const body = await response.text();
  assert.equal(body.includes(refreshToken), false);
});

test('login limiter rejects request 11 with 429 without reaching handler', async () => {
  let calls = 0;
  const limited = createApp({
    login: async () => {
      calls += 1;
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    },
  });
  const [server, base] = await startServer(limited);
  try {
    const csrfResponse = await fetch(`${base}/api/v1/auth/csrf`, { headers: { origin } });
    assert.equal(csrfResponse.status, 200);
    const csrfPayload = (await csrfResponse.json()) as { data: { csrfToken: string } };
    const csrfCookie = csrfResponse.headers.getSetCookie()[0]?.split(';')[0];
    assert.ok(csrfCookie);

    for (let attempt = 1; attempt <= 11; attempt += 1) {
      const response = await fetch(`${base}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          origin,
          cookie: csrfCookie,
          'x-csrf-token': csrfPayload.data.csrfToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email: 'someone@example.com', password: 'WrongPassword123!' }),
      });
      assert.equal(response.status, attempt <= 10 ? 401 : 429);
      if (attempt === 11) {
        const payload = (await response.json()) as { error: { code: string } };
        assert.equal(payload.error.code, 'RATE_LIMITED');
        assert.ok(response.headers.get('retry-after'));
      }
    }
    assert.equal(calls, 10);
  } finally {
    await closeServer(server);
  }
});
