import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '../src/config/database.js';
import { digestRefreshToken, hashPassword, signAccessToken } from '../src/lib/auth-security.js';

const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const apiUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000';
const email = `session-smoke-${randomUUID()}@example.invalid`;
const refreshToken = randomBytes(32).toString('base64url');
const otherToken = randomBytes(32).toString('base64url');
let userId = '';

async function request(path: string, init: RequestInit = {}) {
  try {
    return await fetch(`${apiUrl}${path}`, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new Error(`API unavailable at ${apiUrl}. Start 'pnpm dev:api' in another terminal.`, {
      cause: error,
    });
  }
}

try {
  const user = await prisma.user.create({
    data: {
      email,
      displayName: 'Session Smoke',
      passwordHash: await hashPassword('UnusedSmokePassword123!'),
      role: 'USER',
    },
  });
  userId = user.id;
  const session = await prisma.authSession.create({
    data: {
      userId,
      refreshTokenHash: digestRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    },
  });
  const other = await prisma.authSession.create({
    data: {
      userId,
      refreshTokenHash: digestRefreshToken(otherToken),
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    },
  });
  const accessToken = await signAccessToken(userId, session.id);
  const otherAccess = await signAccessToken(userId, other.id);
  const headers = { Authorization: `Bearer ${accessToken}` };

  const current = await request('/api/v1/users/me', { headers });
  assert.equal(current.status, 200, `Current user returned ${current.status}`);
  const body = (await current.json()) as { data: { id: string; email: string } };
  assert.equal(body.data.id, userId);
  assert.equal(body.data.email, email);
  assert.equal((await request('/api/v1/users/me')).status, 401);

  const csrf = await request('/api/v1/auth/csrf', { headers: { origin } });
  assert.equal(csrf.status, 200);
  const csrfBody = (await csrf.json()) as { data: { csrfToken: string } };
  const csrfCookie = csrf.headers
    .getSetCookie()
    .find((v) => v.startsWith('streamlab_csrf_context='))
    ?.split(';')[0];
  assert.ok(csrfCookie);

  const logout = await request('/api/v1/auth/logout', {
    method: 'POST',
    headers: {
      origin,
      cookie: `${csrfCookie}; streamlab_refresh=${refreshToken}`,
      'x-csrf-token': csrfBody.data.csrfToken,
    },
  });
  assert.equal(logout.status, 204, `Logout returned ${logout.status}`);
  assert.match(logout.headers.getSetCookie().join(';'), /streamlab_refresh=/);
  assert.ok((await prisma.authSession.findUniqueOrThrow({ where: { id: session.id } })).revokedAt);
  assert.equal((await request('/api/v1/users/me', { headers })).status, 401);
  assert.equal(
    (await request('/api/v1/users/me', { headers: { Authorization: `Bearer ${otherAccess}` } }))
      .status,
    200,
  );
  assert.equal(
    (await prisma.authSession.findUniqueOrThrow({ where: { id: other.id } })).revokedAt,
    null,
  );

  console.log(
    'PASS: /users/me -> CSRF logout -> session revoked -> old JWT rejected -> other session active',
  );
} catch (error) {
  console.error('FAIL: STREAM-002.5 session smoke');
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
    console.error('FAIL: session-smoke cleanup', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
