import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { prisma } from '../src/config/database.js';
import { getAuthSecrets } from '../src/config/auth-env.js';
import { digestRefreshToken, hashPassword } from '../src/lib/auth-security.js';
import { jwtVerify } from 'jose';

const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const apiUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000';
const email = `refresh-smoke-${randomUUID()}@example.invalid`;
const firstToken = randomBytes(32).toString('base64url');
let userId = '';

async function apiFetch(path: string, options: RequestInit) {
  try {
    return await fetch(`${apiUrl}${path}`, { ...options, signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new Error(`API unavailable at ${apiUrl}. Start 'pnpm dev:api' in a separate terminal.`, {
      cause: error,
    });
  }
}
async function csrfBootstrap() {
  const response = await apiFetch('/api/v1/auth/csrf', { headers: { origin } });
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { data: { csrfToken: string } };
  const pair = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(pair, 'CSRF cookie missing');
  return { cookie: pair, csrfToken: payload.data.csrfToken };
}
async function performRefresh(refreshToken: string) {
  const csrf = await csrfBootstrap();
  const response = await apiFetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: {
      origin,
      cookie: `${csrf.cookie}; streamlab_refresh=${refreshToken}`,
      'x-csrf-token': csrf.csrfToken,
    },
  });
  const body = (await response.json()) as {
    success: boolean;
    data?: { accessToken: string; user: { id: string } };
    error?: { code: string; message: string };
  };
  return { response, body };
}

try {
  const user = await prisma.user.create({
    data: {
      email,
      displayName: 'Refresh Smoke',
      passwordHash: await hashPassword('UnusedSmokePassword123!'),
      role: 'USER',
    },
  });
  userId = user.id;
  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      refreshTokenHash: digestRefreshToken(firstToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  const first = await performRefresh(firstToken);
  assert.equal(first.response.status, 200, `Refresh failed: ${JSON.stringify(first.body.error)}`);
  assert.ok(first.body.data?.accessToken);
  const refreshedCookie = first.response.headers
    .getSetCookie()
    .find((v) => v.startsWith('streamlab_refresh='));
  assert.ok(refreshedCookie);
  assert.match(refreshedCookie, /HttpOnly/i);
  const pair = refreshedCookie.split(';')[0];
  assert.ok(pair);
  const idx = pair.indexOf('=');
  assert.ok(idx > 0);
  const nextToken = pair.slice(idx + 1);
  assert.ok(nextToken);
  assert.notEqual(nextToken, firstToken);

  const stored = await prisma.authSession.findUniqueOrThrow({ where: { id: session.id } });
  assert.equal(stored.refreshTokenHash, digestRefreshToken(nextToken));
  assert.equal(
    await prisma.consumedRefreshToken.count({
      where: { tokenHash: digestRefreshToken(firstToken) },
    }),
    1,
  );
  const verified = await jwtVerify(
    first.body.data.accessToken,
    new TextEncoder().encode(getAuthSecrets().AUTH_ACCESS_TOKEN_SECRET),
    { algorithms: ['HS256'], issuer: 'streamlab-api', audience: 'streamlab-web' },
  );
  assert.equal(verified.payload.sub, user.id);
  assert.equal(verified.payload.sid, session.id);

  // Reuse consumed token with a newly bootstrapped CSRF context to actually hit replay detection.
  const replay = await performRefresh(firstToken);
  assert.equal(replay.response.status, 401);
  assert.equal(replay.body.error?.code, 'INVALID_REFRESH_TOKEN');
  assert.ok((await prisma.authSession.findUniqueOrThrow({ where: { id: session.id } })).revokedAt);
  const afterRevoke = await performRefresh(nextToken);
  assert.equal(afterRevoke.response.status, 401);

  console.log(
    'PASS: refresh rotation -> consumed token history -> replay revokes session -> JWT verified',
  );
} catch (error) {
  console.error('FAIL: STREAM-002.4 refresh smoke');
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    if (userId) {
      await prisma.consumedRefreshToken.deleteMany({ where: { session: { userId } } });
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  } catch (error) {
    process.exitCode = 1;
    console.error('FAIL: refresh-smoke cleanup', error);
  } finally {
    await prisma.$disconnect();
  }
}
