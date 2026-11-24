import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { prisma, disconnectDatabase } from '../src/config/database.js';
import { signAccessToken } from '../src/lib/auth-security.js';

const base = `${process.env.API_BASE_URL ?? 'http://127.0.0.1:4000'}/api/v1/videos`;
const suffix = randomUUID();
const users: string[] = [];
const videos: string[] = [];
const categories: string[] = [];
let ownerToken = '';
let strangerToken = '';

async function main(): Promise<void> {
  const owner = await prisma.user.create({
    data: {
      email: `stream-0036-owner-${suffix}@example.invalid`,
      displayName: 'Delete Smoke Owner',
      passwordHash: 'test-hash',
    },
  });
  users.push(owner.id);
  const stranger = await prisma.user.create({
    data: {
      email: `stream-0036-guest-${suffix}@example.invalid`,
      displayName: 'Delete Smoke Stranger',
      passwordHash: 'test-hash',
    },
  });
  users.push(stranger.id);

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
  ownerToken = await signAccessToken(owner.id, ownerSession.id);
  strangerToken = await signAccessToken(stranger.id, strangerSession.id);

  const category = await prisma.category.create({
    data: { name: 'Delete Smoke Category', slug: `delete-smoke-${suffix}` },
  });
  categories.push(category.id);
  const video = await prisma.video.create({
    data: {
      ownerId: owner.id,
      title: `Delete Smoke ${suffix}`,
      status: 'READY',
      visibility: 'PUBLIC',
      publishedAt: new Date(Date.now() - 60_000),
      categories: { create: [{ categoryId: category.id }] },
      mediaAssets: {
        create: [
          {
            kind: 'ORIGINAL',
            contentType: 'video/mp4',
            storageKey: `test-delete/${suffix}/original.mp4`,
          },
        ],
      },
    },
  });
  videos.push(video.id);
  const other = await prisma.video.create({
    data: { ownerId: stranger.id, title: 'Other user video' },
  });
  videos.push(other.id);

  const del = (id: string, token?: string) =>
    fetch(`${base}/${id}`, {
      method: 'DELETE',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(20_000),
    });
  const get = (path: string, token?: string) =>
    fetch(`${base}${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(20_000),
    });

  assert.equal((await del(video.id)).status, 401, 'anonymous deletion');
  assert.equal((await del(video.id, strangerToken)).status, 404, 'foreign-owned deletion');
  assert.equal((await del('not-a-uuid', ownerToken)).status, 422, 'invalid UUID');
  assert.equal((await del(randomUUID(), ownerToken)).status, 404, 'nonexistent video');
  assert.equal((await get(`/${video.id}`)).status, 200, 'public detail before deletion');

  const response = await del(video.id, ownerToken);
  assert.equal(response.status, 202, `DELETE failed: ${response.status}`);
  assert.deepEqual(await response.json(), { success: true, data: { status: 'DELETING' } });
  const stored = await prisma.video.findUniqueOrThrow({ where: { id: video.id } });
  assert.equal(stored.status, 'DELETING');
  assert.equal(stored.visibility, 'PRIVATE');
  assert.ok(stored.deletedAt);
  assert.equal(
    await prisma.videoCategory.count({ where: { videoId: video.id } }),
    1,
    'category retained for cleanup',
  );
  assert.equal(
    await prisma.mediaAsset.count({ where: { videoId: video.id } }),
    1,
    'asset metadata retained for cleanup',
  );
  assert.equal((await get(`/${video.id}`)).status, 404, 'deleted public detail');
  assert.equal((await get(`/${video.id}`, ownerToken)).status, 404, 'deleted owner detail');

  const mineResponse = await get('/mine?limit=50', ownerToken);
  assert.equal(mineResponse.status, 200);
  const mine = (await mineResponse.json()) as { data: { items: Array<{ id: string }> } };
  assert.ok(
    mine.data.items.every((v) => v.id !== video.id),
    'deleted video hidden from owner list',
  );
  const publicResponse = await get(`?q=${encodeURIComponent(`Delete Smoke ${suffix}`)}`);
  assert.equal(publicResponse.status, 200);
  const discovery = (await publicResponse.json()) as { data: { items: Array<{ id: string }> } };
  assert.ok(
    discovery.data.items.every((v) => v.id !== video.id),
    'deleted video hidden from discovery',
  );
  assert.equal((await del(video.id, ownerToken)).status, 404, 'second DELETE is hidden');
  assert.equal(
    (
      await fetch(`${base}/${video.id}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Must not update' }),
        signal: AbortSignal.timeout(20_000),
      })
    ).status,
    404,
    'PATCH after soft delete',
  );
  const otherStored = await prisma.video.findUniqueOrThrow({ where: { id: other.id } });
  assert.equal(otherStored.deletedAt, null, 'other user unaffected');

  console.log(
    'PASS: owner-only DELETE 202 -> DELETING/soft delete -> public/mine/detail 404 -> repeat 404 -> related records retained',
  );
}

main()
  .catch((error: unknown) => {
    console.error('STREAM-003.6 delete smoke failed; check API and PostgreSQL:', base);
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (videos.length) {
        await prisma.videoCategory.deleteMany({ where: { videoId: { in: videos } } });
        await prisma.mediaAsset.deleteMany({ where: { videoId: { in: videos } } });
        await prisma.video.deleteMany({ where: { id: { in: videos } } });
      }
      if (users.length) {
        await prisma.authSession.deleteMany({ where: { userId: { in: users } } });
        await prisma.user.deleteMany({ where: { id: { in: users } } });
      }
      if (categories.length)
        await prisma.category.deleteMany({ where: { id: { in: categories } } });
    } catch (error) {
      console.error('STREAM-003.6 cleanup failed:', error);
      process.exitCode = 1;
    } finally {
      await disconnectDatabase();
    }
  });
