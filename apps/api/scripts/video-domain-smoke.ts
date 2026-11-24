import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma, disconnectDatabase } from '../src/config/database.js';

// Roll back the whole test transaction: never leave test accounts or videos in the database.
const rollback = new Error('stream-003-1-expected-rollback');

async function main(): Promise<void> {
  let verified = false;

  try {
    await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            email: `stream-0031-${randomUUID()}@example.invalid`,
            displayName: 'Video Domain Smoke',
            passwordHash: 'unusable-test-hash',
          },
        });

        const video = await tx.video.create({
          data: {
            ownerId: user.id,
            title: 'STREAM-003.1 video domain smoke',
          },
          include: { owner: true },
        });

        assert.equal(video.owner.id, user.id);
        assert.equal(video.status, 'DRAFT');
        assert.equal(video.visibility, 'PRIVATE');
        assert.equal(video.deletedAt, null);
        assert.equal(video.publishedAt, null);
        assert.equal(video.processingVersion, 0);

        const published = await tx.video.update({
          where: { id: video.id },
          data: {
            status: 'READY',
            visibility: 'PUBLIC',
            publishedAt: new Date(),
          },
        });

        assert.equal(published.status, 'READY');
        assert.equal(published.visibility, 'PUBLIC');

        const discoveryFilter = {
          id: video.id,
          status: 'READY' as const,
          visibility: 'PUBLIC' as const,
          deletedAt: null,
          publishedAt: { not: null },
        };
        assert.equal(await tx.video.count({ where: discoveryFilter }), 1);

        const deleted = await tx.video.update({
          where: { id: video.id },
          data: { deletedAt: new Date(), visibility: 'PRIVATE' },
        });
        assert.ok(deleted.deletedAt);
        assert.equal(await tx.video.count({ where: discoveryFilter }), 0);

        verified = true;
        throw rollback;
      },
      { timeout: 15_000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }

  assert.ok(verified, 'Video domain transaction did not complete');
  console.log('PASS: video owner -> DRAFT/PRIVATE -> READY/PUBLIC -> soft delete -> rollback');
}

main()
  .catch((error: unknown) => {
    console.error('STREAM-003.1 video domain smoke failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
