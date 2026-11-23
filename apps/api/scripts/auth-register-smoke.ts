import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/config/database.js';
import { verifyPassword } from '../src/lib/auth-security.js';

const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const apiUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000';
const email = `register-smoke-${randomUUID()}@example.invalid`;
const password = `StreamLab-test-${randomUUID()}!`;
let userId: string | undefined;

try {
  const boot = await fetch(`${apiUrl}/api/v1/auth/csrf`, {
    headers: { origin },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(boot.status, 200, 'CSRF endpoint must respond 200');
  const csrf = (await boot.json()) as { data: { csrfToken: string } };
  const cookie = boot.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie, 'CSRF cookie should be set');

  const response = await fetch(`${apiUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      cookie,
      'x-csrf-token': csrf.data.csrfToken,
    },
    body: JSON.stringify({ email, displayName: 'Register Smoke', password }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.json()) as {
    success: boolean;
    data?: { user: { id: string; email: string }; accessToken: string };
    error?: unknown;
  };
  assert.equal(response.status, 201, JSON.stringify(body.error));
  assert.equal(body.success, true);
  assert.equal(body.data?.user.email, email);
  userId = body.data?.user.id;
  assert.ok(userId);
  assert.ok(response.headers.getSetCookie().some((item) => item.startsWith('streamlab_refresh=')));

  const persisted = await prisma.user.findUnique({
    where: { id: userId },
    include: { sessions: true },
  });
  assert.ok(persisted);
  assert.equal(await verifyPassword(persisted.passwordHash, password), true);
  assert.equal(persisted.sessions.length, 1);
  assert.ok(!JSON.stringify(body).includes('passwordHash'));
  assert.ok(!JSON.stringify(body).includes('refreshToken'));
  console.log('PASS: CSRF -> Register -> JWT/cookie -> PostgreSQL -> Argon2id');
} finally {
  // Idempotent, scoped cleanup. Never reset the user's database or other users.
  await prisma.authSession.deleteMany({ where: { user: { email } } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
}
