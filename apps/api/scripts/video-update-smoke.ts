import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { prisma, disconnectDatabase } from '../src/config/database.js';
import { signAccessToken } from '../src/lib/auth-security.js';

const base = `${process.env.API_BASE_URL ?? 'http://127.0.0.1:4000'}/api/v1/videos`;
const suffix = randomUUID();
const userIds: string[] = [];
const videoIds: string[] = [];
const categoryIds: string[] = [];

async function main(): Promise<void> {
  const owner = await prisma.user.create({
    data: {
      email: `stream-0035-owner-${suffix}@example.invalid`,
      displayName: 'Update Smoke Owner',
      passwordHash: 'unused-test-hash',
    },
  });
  userIds.push(owner.id);
  const stranger = await prisma.user.create({
    data: {
      email: `stream-0035-stranger-${suffix}@example.invalid`,
      displayName: 'Update Smoke Stranger',
      passwordHash: 'unused-test-hash',
    },
  });
  userIds.push(stranger.id);
  const ownerSession = await prisma.authSession.create({
    data: {
      userId: owner.id,
      refreshTokenHash: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  const strangerSession = await prisma.authSession.create({
    data: {
      userId: stranger.id,
      refreshTokenHash: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  const ownerToken = await signAccessToken(owner.id, ownerSession.id);
  const strangerToken = await signAccessToken(stranger.id, strangerSession.id);
  const category1 = await prisma.category.create({
    data: { name: 'Update Smoke 1', slug: `up-1-${suffix}` },
  });
  const category2 = await prisma.category.create({
    data: { name: 'Update Smoke 2', slug: `up-2-${suffix}` },
  });
  categoryIds.push(category1.id, category2.id);
  const draft = await prisma.video.create({
    data: {
      ownerId: owner.id,
      title: 'Before Edit',
      description: 'Old description',
      categories: { create: [{ categoryId: category1.id }] },
    },
  });
  videoIds.push(draft.id);
  const readyPrivate = await prisma.video.create({
    data: {
      ownerId: owner.id,
      title: 'Previously Published',
      status: 'READY',
      visibility: 'PRIVATE',
      publishedAt: new Date(Date.now() - 3_600_000),
    },
  });
  videoIds.push(readyPrivate.id);
  const deleted = await prisma.video.create({
    data: {
      ownerId: owner.id,
      title: 'Already Deleted',
      deletedAt: new Date(),
    },
  });
  videoIds.push(deleted.id);

  const patch = (id: string, data: unknown, token?: string) =>
    fetch(`${base}/${id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(20_000),
    });

  assert.equal((await patch(draft.id, { title: 'Bad' })).status, 401);
  assert.equal((await patch(draft.id, { title: 'Bad' }, strangerToken)).status, 404);
  assert.equal((await patch(deleted.id, { title: 'Bad' }, ownerToken)).status, 404);
  assert.equal(
    (await patch(draft.id, { title: 'Bad', ownerId: stranger.id }, ownerToken)).status,
    422,
  );
  assert.equal((await patch(draft.id, {}, ownerToken)).status, 422);
  assert.equal((await patch(draft.id, { visibility: 'PUBLIC' }, ownerToken)).status, 409);
  const missingId = randomUUID();
  assert.equal(
    (await patch(draft.id, { title: 'Should Roll Back', categoryIds: [missingId] }, ownerToken))
      .status,
    422,
  );
  const unchanged = await prisma.video.findUniqueOrThrow({
    where: { id: draft.id },
    include: { categories: true },
  });
  assert.equal(unchanged.title, 'Before Edit');
  assert.deepEqual(
    unchanged.categories.map((x) => x.categoryId),
    [category1.id],
  );

  const updated = await patch(
    draft.id,
    {
      title: '  Edited metadata   ',
      description: null,
      categoryIds: [category2.id],
    },
    ownerToken,
  );
  if (updated.status !== 200)
    throw new Error(`PATCH returned ${updated.status}: ${await updated.text()}`);
  const payload = (await updated.json()) as { data: Record<string, unknown> };
  assert.equal(payload.data.title, 'Edited metadata');
  assert.ok(!('processingVersion' in payload.data));
  assert.ok(!('deletedAt' in payload.data));
  const persisted = await prisma.video.findUniqueOrThrow({
    where: { id: draft.id },
    include: { categories: true },
  });
  assert.equal(persisted.title, 'Edited metadata');
  assert.equal(persisted.description, null);
  assert.equal(persisted.status, 'DRAFT');
  assert.equal(persisted.visibility, 'PRIVATE');
  assert.equal(persisted.publishedAt, null);
  assert.deepEqual(
    persisted.categories.map((item) => item.categoryId),
    [category2.id],
  );
  assert.equal((await patch(draft.id, { categoryIds: [] }, ownerToken)).status, 200);
  assert.equal(await prisma.videoCategory.count({ where: { videoId: draft.id } }), 0);

  assert.equal((await patch(readyPrivate.id, { visibility: 'PUBLIC' }, ownerToken)).status, 200);
  const publicVideo = await prisma.video.findUniqueOrThrow({ where: { id: readyPrivate.id } });
  assert.equal(publicVideo.visibility, 'PUBLIC');
  assert.equal(publicVideo.status, 'READY');
  assert.ok(publicVideo.publishedAt);
  const detail = await fetch(`${base}/${readyPrivate.id}`, { signal: AbortSignal.timeout(20_000) });
  assert.equal(detail.status, 200);

  console.log(
    'PASS: PATCH owner-only -> validation -> atomic categories -> draft exposure 409 -> previously published READY visibility -> no leaked state',
  );
}

main()
  .catch((error: unknown) => {
    console.error('STREAM-003.5 smoke failed. Ensure API and PostgreSQL are running:', base);
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (videoIds.length) {
        await prisma.videoCategory.deleteMany({ where: { videoId: { in: videoIds } } });
        await prisma.video.deleteMany({ where: { id: { in: videoIds } } });
      }
      if (userIds.length) {
        await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      if (categoryIds.length)
        await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    } catch (error) {
      console.error('STREAM-003.5 test cleanup failed:', error);
      process.exitCode = 1;
    } finally {
      await disconnectDatabase();
    }
  });
