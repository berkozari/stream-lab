import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { prisma, disconnectDatabase } from '../src/config/database.js';
import { signAccessToken } from '../src/lib/auth-security.js';

const base = `${process.env.API_BASE_URL ?? 'http://127.0.0.1:4000'}/api/v1/videos`;
const suffix = randomUUID();
const users: string[] = [];
const videos: string[] = [];
let categoryId: string | undefined;

async function main(): Promise<void> {
  const owner = await prisma.user.create({
    data: {
      email: `stream-0034-owner-${suffix}@example.invalid`,
      displayName: 'Read Smoke Owner',
      passwordHash: 'unused-test-hash',
    },
  });
  users.push(owner.id);
  const stranger = await prisma.user.create({
    data: {
      email: `stream-0034-stranger-${suffix}@example.invalid`,
      displayName: 'Read Smoke Stranger',
      passwordHash: 'unused-test-hash',
    },
  });
  users.push(stranger.id);
  const session = await prisma.authSession.create({
    data: {
      userId: owner.id,
      refreshTokenHash: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const otherSession = await prisma.authSession.create({
    data: {
      userId: stranger.id,
      refreshTokenHash: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const token = await signAccessToken(owner.id, session.id);
  const otherToken = await signAccessToken(stranger.id, otherSession.id);
  const category = await prisma.category.create({
    data: { name: 'Video Read Smoke', slug: `read-${suffix}` },
  });
  categoryId = category.id;
  const now = new Date();
  const publishDate = new Date(now.getTime() - 120_000);
  const make = async (params: {
    title: string;
    status?: 'DRAFT' | 'READY';
    visibility?: 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
    published?: boolean;
    deleted?: boolean;
    daysAgo?: number;
    ownerId?: string;
    withCategory?: boolean;
  }) => {
    const row = await prisma.video.create({
      data: {
        ownerId: params.ownerId ?? owner.id,
        title: params.title,
        status: params.status ?? 'DRAFT',
        visibility: params.visibility ?? 'PRIVATE',
        publishedAt: params.published ? publishDate : null,
        deletedAt: params.deleted ? now : null,
        createdAt: new Date(now.getTime() - (params.daysAgo ?? 0) * 86_400_000),
        ...(params.withCategory
          ? { categories: { create: [{ category: { connect: { id: categoryId! } } }] } }
          : {}),
      },
    });
    videos.push(row.id);
    return row;
  };
  const searchTerm = `VideoRead-${suffix}`;
  const public1 = await make({
    title: `${searchTerm} Alpine`,
    status: 'READY',
    visibility: 'PUBLIC',
    published: true,
    daysAgo: 1,
    withCategory: true,
  });
  const public2 = await make({
    title: `${searchTerm} Forest`,
    status: 'READY',
    visibility: 'PUBLIC',
    published: true,
    daysAgo: 2,
    withCategory: true,
  });
  const unlisted = await make({
    title: 'Unlisted Secret',
    status: 'READY',
    visibility: 'UNLISTED',
    published: true,
    daysAgo: 3,
  });
  const draft = await make({ title: 'Private Draft', daysAgo: 4 });
  const deleted = await make({ title: 'Deleted Secret', deleted: true, daysAgo: 5 });

  const get = (path: string, jwt?: string) =>
    fetch(`${base}${path}`, {
      headers: jwt ? { authorization: `Bearer ${jwt}` } : {},
      signal: AbortSignal.timeout(20_000),
    });
  const unpack = async (
    response: Response,
  ): Promise<{ items: { id: string }[]; nextCursor: string | null }> => {
    if (response.status !== 200)
      throw new Error(`Unexpected HTTP ${response.status}: ${await response.text()}`);
    const json = (await response.json()) as {
      data: { items: { id: string }[]; nextCursor: string | null };
    };
    return json.data;
  };

  const first = await unpack(await get(`?limit=1&q=${encodeURIComponent(searchTerm)}`));
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0]?.id, public1.id);
  assert.ok(first.nextCursor);
  const second = await unpack(
    await get(
      `?limit=1&q=${encodeURIComponent(searchTerm)}&cursor=${encodeURIComponent(first.nextCursor)}`,
    ),
  );
  assert.equal(second.items[0]?.id, public2.id);
  assert.equal(second.nextCursor, null);
  const filtered = await unpack(await get(`?category=${category.slug}`));
  assert.deepEqual(
    filtered.items.map((item) => item.id),
    [public1.id, public2.id],
  );
  const mine = await unpack(await get('/mine', token));
  assert.ok(mine.items.some((item) => item.id === draft.id));
  assert.ok(!mine.items.some((item) => item.id === deleted.id));
  assert.equal((await get('/mine')).status, 401);
  assert.equal((await get(`/${draft.id}`)).status, 404);
  assert.equal((await get(`/${draft.id}`, otherToken)).status, 404);
  assert.equal((await get(`/${draft.id}`, token)).status, 200);
  assert.equal((await get(`/${unlisted.id}`)).status, 200);
  assert.equal((await get(`/${deleted.id}`, token)).status, 404);
  assert.equal((await get(`/${draft.id}`, 'invalid')).status, 401);
  assert.equal((await get('/not-a-uuid')).status, 422);
  assert.equal((await get('?cursor=invalid')).status, 422);
  assert.equal((await get(`?cursor=${encodeURIComponent(first.nextCursor!)}`)).status, 422);
  console.log(
    'PASS: public READY/PUBLIC discovery -> keyset cursor -> owner drafts -> unlisted detail -> private/deleted 404',
  );
}

main()
  .catch((error: unknown) => {
    console.error('STREAM-003.4 video read smoke failed. Ensure the API is running at:', base);
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (videos.length) await prisma.video.deleteMany({ where: { id: { in: videos } } });
      if (users.length) {
        await prisma.authSession.deleteMany({ where: { userId: { in: users } } });
        await prisma.user.deleteMany({ where: { id: { in: users } } });
      }
      if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    } catch (error) {
      console.error('STREAM-003.4 smoke cleanup failed:', error);
      process.exitCode = 1;
    } finally {
      await disconnectDatabase();
    }
  });
