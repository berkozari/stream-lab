/** Explicitly opt-in on a disposable PostgreSQL database. Changes roll back. */
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { prisma, disconnectDatabase } from '../src/config/database.js';
import { purgeExpiredAnalyticsBatch } from '../src/repositories/analytics-retention.repository.js';

class RollbackFixture extends Error {}

async function main() {
  if (process.env.ANALYTICS_INTEGRATION_ACK !== 'disposable-database') {
    throw new Error('Only run on disposable DB with ANALYTICS_INTEGRATION_ACK=disposable-database');
  }
  const userId = randomUUID();
  const videoId = randomUUID();
  const old = new Date('2025-01-01T12:00:00.000Z');
  const current = new Date('2026-11-27T12:00:00.000Z');
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.user.create({
          data: {
            id: userId,
            email: `retention-${userId}@example.invalid`,
            passwordHash: 'fixture',
            displayName: 'Test',
          },
        });
        await tx.video.create({
          data: { id: videoId, ownerId: userId, title: 'Retention fixture' },
        });
        await tx.playbackAnalyticsSession.createMany({
          data: [
            {
              id: randomUUID(),
              videoId,
              processingVersion: 0,
              lastSequence: 2,
              startedAt: old,
              lastEventAt: old,
              qualifiedAt: old,
              completedAt: old,
              watchedSeconds: 42,
            },
            {
              id: randomUUID(),
              videoId,
              processingVersion: 0,
              startedAt: old,
              lastEventAt: old,
              watchedSeconds: 12,
            },
            {
              id: randomUUID(),
              videoId,
              processingVersion: 0,
              startedAt: current,
              lastEventAt: current,
              qualifiedAt: current,
              watchedSeconds: 5,
            },
          ],
        });
        const cutoff = new Date('2026-07-30T12:00:00.000Z');
        const first = await purgeExpiredAnalyticsBatch(tx, cutoff, 2);
        assert.deepEqual(first, { deletedCount: 2, archiveUpdates: 1 });
        const archive = await tx.videoAnalyticsArchive.findUniqueOrThrow({ where: { videoId } });
        assert.equal(archive.qualifiedViews, 1n);
        assert.equal(archive.completedViews, 1n);
        assert.equal(archive.watchSeconds, 42n);
        assert.equal(await tx.playbackAnalyticsSession.count({ where: { videoId } }), 1);
        assert.deepEqual(await purgeExpiredAnalyticsBatch(tx, cutoff, 2), {
          deletedCount: 0,
          archiveUpdates: 0,
        });
        throw new RollbackFixture();
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    if (!(error instanceof RollbackFixture)) throw error;
  }
  assert.equal(await prisma.videoAnalyticsArchive.count({ where: { videoId } }), 0);
  assert.equal(await prisma.video.count({ where: { id: videoId } }), 0);
  console.log(
    '[STREAM-009.4] PASS: transactional archive, purge, retry and rollback (isolated DB)',
  );
}

try {
  await main();
} catch (error) {
  console.error('[STREAM-009.4] FAIL:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
