import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { jwtVerify } from 'jose';
import { prisma } from '../src/config/database.js';
import { getAuthSecrets } from '../src/config/auth-env.js';
import { digestRefreshToken, hashPassword } from '../src/lib/auth-security.js';

const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const apiUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000';
const email = `login-smoke-${randomUUID()}@example.invalid`;
const password = `StreamLab-login-smoke-${randomUUID()}!`;

async function apiFetch(path: string, options: RequestInit) {
  try {
    return await fetch(`${apiUrl}${path}`, { ...options, signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new Error(
      `API unavailable at ${apiUrl}. Start it in another terminal with 'pnpm dev:api'.`,
      { cause: error },
    );
  }
}

try {
  // Use a uniquely scoped database fixture, not POST /register, to avoid its rate limit.
  const user = await prisma.user.create({
    data: {
      email,
      displayName: 'Login Smoke',
      passwordHash: await hashPassword(password),
      role: 'USER',
    },
  });

  const bootstrap = await apiFetch('/api/v1/auth/csrf', { headers: { origin } });
  assert.equal(bootstrap.status, 200, 'Expected CSRF bootstrap HTTP 200');
  const csrf = (await bootstrap.json()) as { data: { csrfToken: string } };
  const cookie = bootstrap.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie, 'CSRF cookie is missing');

  const login = await apiFetch('/api/v1/auth/login', {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      cookie,
      'x-csrf-token': csrf.data.csrfToken,
    },
    body: JSON.stringify({ email, password }),
  });
  const body = (await login.json()) as {
    success: boolean;
    data?: { accessToken: string; user: { id: string; email: string } };
    error?: { code: string; message: string };
  };
  assert.equal(login.status, 200, `Login returned ${login.status}: ${JSON.stringify(body.error)}`);
  assert.equal(body.success, true);
  assert.equal(body.data?.user.id, user.id);
  assert.equal(body.data?.user.email, email);
  assert.ok(body.data?.accessToken);
  assert.ok(!JSON.stringify(body).includes('passwordHash'));
  assert.ok(!JSON.stringify(body).includes('refreshToken'));

  const refreshCookie = login.headers
    .getSetCookie()
    .find((value) => value.startsWith('streamlab_refresh='));
  assert.ok(refreshCookie, 'HttpOnly refresh cookie missing');
  assert.match(refreshCookie, /HttpOnly/i);
  const refreshToken = refreshCookie.split(';')[0].split('=')[1];
  assert.ok(refreshToken);
  const sessions = await prisma.authSession.findMany({ where: { userId: user.id } });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].refreshTokenHash, digestRefreshToken(refreshToken));

  const decoded = await jwtVerify(
    body.data.accessToken,
    new TextEncoder().encode(getAuthSecrets().AUTH_ACCESS_TOKEN_SECRET),
    {
      algorithms: ['HS256'],
      issuer: 'streamlab-api',
      audience: 'streamlab-web',
    },
  );
  assert.equal(decoded.payload.sub, user.id);
  assert.equal(decoded.payload.sid, sessions[0].id);

  // Bootstrap a fresh browser CSRF context after successful login.
  const nextBootstrap = await apiFetch('/api/v1/auth/csrf', { headers: { origin } });
  assert.equal(nextBootstrap.status, 200);
  const nextCsrf = (await nextBootstrap.json()) as { data: { csrfToken: string } };
  const nextCookie = nextBootstrap.headers.get('set-cookie')?.split(';')[0];
  assert.ok(nextCookie);
  const invalid = await apiFetch('/api/v1/auth/login', {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      cookie: nextCookie,
      'x-csrf-token': nextCsrf.data.csrfToken,
    },
    body: JSON.stringify({ email, password: 'incorrect-password' }),
  });
  assert.equal(invalid.status, 401, 'Wrong password must return HTTP 401');
  const invalidBody = (await invalid.json()) as { error: { code: string } };
  assert.equal(invalidBody.error.code, 'INVALID_CREDENTIALS');
  assert.equal(await prisma.authSession.count({ where: { userId: user.id } }), 1);

  console.log(
    'PASS: CSRF -> Login -> JWT/HttpOnly cookie -> PostgreSQL session -> invalid credentials (401)',
  );
} catch (error) {
  console.error('FAIL: STREAM-002.3 login smoke');
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    await prisma.authSession.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
  } catch (error) {
    process.exitCode = 1;
    console.error('FAIL: cleanup of login-smoke fixture', error);
  } finally {
    await prisma.$disconnect();
  }
}
