import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { prisma, disconnectDatabase } from '../src/config/database.js';
import { signAccessToken } from '../src/lib/auth-security.js';

const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000';
const email = `stream-0033-${randomUUID()}@example.invalid`;
const categorySlug = `stream-0033-${randomUUID()}`;
let userId: string | undefined;
let videoId: string | undefined;
let categoryId: string | undefined;

async function main(): Promise<void> {
  const user = await prisma.user.create({
    data: { email, displayName: 'Video Create Smoke', passwordHash: 'unusable-test-hash' },
  });
  userId = user.id;
  const sessionId = randomUUID();
  await prisma.authSession.create({
    data: {
      id: sessionId,
      userId,
      refreshTokenHash: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const category = await prisma.category.create({
    data: { name: 'Video Create Smoke', slug: categorySlug },
  });
  categoryId = category.id;

  const token = await signAccessToken(userId, sessionId);
  const url = `${apiBase}/api/v1/videos`;
  const request = (body: unknown, authorization = `Bearer ${token}`) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });

  assert.equal((await request({ title: 'No auth' }, '')).status, 401);
  assert.equal((await request({ title: 'Mass-assignment', ownerId: randomUUID() })).status, 422);

  const missingId = randomUUID();
  const missing = await request({ title: 'Invalid category', categoryIds: [missingId] });
  assert.equal(missing.status, 422, `Missing category response: ${await missing.text()}`);
  assert.equal(await prisma.video.count({ where: { ownerId: userId } }), 0);

  const created = await request({
    title: '  STREAM-003.3 smoke video  ',
    description: null,
    categoryIds: [categoryId],
  });
  const result = (await created.json()) as {
    success: boolean;
    data?: { id: string; ownerId: string; title: string; status: string; visibility: string };
    error?: unknown;
  };
  assert.equal(created.status, 201, JSON.stringify(result.error));
  assert.equal(result.success, true);
  assert.ok(result.data);
  videoId = result.data.id;
  assert.equal(result.data.ownerId, userId);
  assert.equal(result.data.title, 'STREAM-003.3 smoke video');
  assert.equal(result.data.status, 'DRAFT');
  assert.equal(result.data.visibility, 'PRIVATE');
  assert.equal(created.headers.get('cache-control'), 'no-store');
  assert.ok(!JSON.stringify(result).includes('processingVersion'));
  assert.ok(!JSON.stringify(result).includes('deletedAt'));

  const persisted = await prisma.video.findUnique({
    where: { id: videoId },
    include: { categories: true },
  });
  assert.ok(persisted);
  assert.equal(persisted.ownerId, userId);
  assert.equal(persisted.deletedAt, null);
  assert.equal(persisted.publishedAt, null);
  assert.equal(persisted.categories.length, 1);
  assert.equal(persisted.categories[0]?.categoryId, categoryId);

  console.log(
    'PASS: JWT owner -> valid categories -> DRAFT/PRIVATE -> sanitized 201 -> PostgreSQL',
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      'STREAM-003.3 create video smoke failed. Ensure the API is running on API_BASE_URL:',
      apiBase,
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (videoId) await prisma.video.deleteMany({ where: { id: videoId } });
      if (userId) {
        await prisma.authSession.deleteMany({ where: { userId } });
        await prisma.video.deleteMany({ where: { ownerId: userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
      }
      if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    } catch (error) {
      console.error('STREAM-003.3 smoke cleanup failed:', error);
      process.exitCode = 1;
    } finally {
      await disconnectDatabase();
    }
  });
