import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '../src/config/database.js';
import { digestRefreshToken, hashPassword, signAccessToken } from '../src/lib/auth-security.js';

const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000';
const email = `auth-security-${randomUUID()}@example.invalid`;
const tokenA = randomBytes(32).toString('base64url');
const tokenB = randomBytes(32).toString('base64url');
let userId = '';

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${apiBase}${path}`, {
      ...options,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new Error(`API unavailable at ${apiBase}. Start 'pnpm dev:api' in a separate terminal.`, {
      cause: error,
    });
  }
}

async function getCsrf() {
  const response = await apiFetch('/api/v1/auth/csrf', { headers: { origin } });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { csrfToken: string } };
  const cookie = response.headers
    .getSetCookie()
    .find((item) => item.startsWith('streamlab_csrf_context='))
    ?.split(';')[0];
  assert.ok(cookie, 'CSRF context cookie missing');
  return { cookie, token: body.data.csrfToken };
}

async function refresh(token: string) {
  const csrf = await getCsrf();
  const response = await apiFetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: {
      origin,
      cookie: `${csrf.cookie}; streamlab_refresh=${token}`,
      'x-csrf-token': csrf.token,
    },
  });
  return {
    status: response.status,
    payload: (await response.json()) as {
      data?: { accessToken: string };
      error?: { code: string };
    },
  };
}

try {
  const user = await prisma.user.create({
    data: {
      email,
      displayName: 'Auth Security Smoke',
      passwordHash: await hashPassword('UnusedSecurityPassword123!'),
    },
  });
  userId = user.id;

  const first = await prisma.authSession.create({
    data: {
      userId,
      refreshTokenHash: digestRefreshToken(tokenA),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const second = await prisma.authSession.create({
    data: {
      userId,
      refreshTokenHash: digestRefreshToken(tokenB),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });

  const csrfA = await getCsrf();
  const csrfB = await getCsrf();
  const requestWith = (csrf: typeof csrfA) =>
    apiFetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: {
        origin,
        cookie: `${csrf.cookie}; streamlab_refresh=${tokenA}`,
        'x-csrf-token': csrf.token,
      },
    });

  // Both requests deliberately present the same token; only one can consume it.
  const [a, b] = await Promise.all([requestWith(csrfA), requestWith(csrfB)]);
  const statuses = [a.status, b.status].sort((left, right) => left - right);
  assert.deepEqual(statuses, [200, 401], 'Exactly one concurrent rotation should win');
  const winner = a.status === 200 ? a : b;
  const loser = a.status === 401 ? a : b;
  const winnerPayload = (await winner.json()) as { data?: { accessToken: string } };
  const loserPayload = (await loser.json()) as { error?: { code: string } };
  assert.ok(winnerPayload.data?.accessToken);
  assert.equal(loserPayload.error?.code, 'INVALID_REFRESH_TOKEN');

  assert.equal(
    await prisma.consumedRefreshToken.count({ where: { tokenHash: digestRefreshToken(tokenA) } }),
    1,
  );
  const currentFirst = await prisma.authSession.findUniqueOrThrow({ where: { id: first.id } });
  assert.ok(currentFirst.revokedAt, 'Replay must revoke the affected token family');
  assert.notEqual(currentFirst.refreshTokenHash, digestRefreshToken(tokenA));
  const currentSecond = await prisma.authSession.findUniqueOrThrow({ where: { id: second.id } });
  assert.equal(currentSecond.revokedAt, null, 'Unrelated session must stay active');

  const accessToken = await signAccessToken(userId, first.id);
  const invalidated = await apiFetch('/api/v1/users/me', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert.equal(invalidated.status, 401, 'Revoked session must invalidate access JWT');

  const otherDevice = await refresh(tokenB);
  assert.equal(otherDevice.status, 200, 'Unrelated device must still refresh');
  assert.ok(otherDevice.payload.data?.accessToken);

  console.log(
    'PASS: concurrent refresh (one winner) -> replay revokes family -> JWT denied -> other session survives',
  );
} catch (error) {
  process.exitCode = 1;
  console.error('FAIL: STREAM-002.8 security smoke');
  console.error(error);
} finally {
  try {
    if (userId) {
      await prisma.consumedRefreshToken.deleteMany({ where: { session: { userId } } });
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  } catch (error) {
    process.exitCode = 1;
    console.error('FAIL: security-smoke cleanup', error);
  } finally {
    await prisma.$disconnect();
  }
}
