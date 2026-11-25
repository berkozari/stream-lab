import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

/** Opt-in: run only against a migrated disposable/dev PostgreSQL database. */
test('stage is atomic, unique per version and rejects repeated queueing', async (t) => {
  if (process.env.STREAMLAB_TEST_DB !== '1') {
    t.skip('Set STREAMLAB_TEST_DB=1 to run PostgreSQL integration test');
    return;
  }
  const [{ prisma }, { stageTranscodingAttempt }] = await Promise.all([
    import('../../src/config/database.js'),
    import('../../src/repositories/video-transcode-outbox.repository.js'),
  ]);
  const email = `transcoding-${randomUUID()}@example.invalid`;
  const user = await prisma.user.create({
    data: { email, passwordHash: 'integration-test-only', displayName: 'Outbox Test' },
  });
  let videoId: string | undefined;
  try {
    const video = await prisma.video.create({
      data: { title: 'Outbox Test', ownerId: user.id, status: 'UPLOADED' },
    });
    videoId = video.id;
    await prisma.mediaAsset.create({
      data: {
        videoId: video.id,
        kind: 'ORIGINAL',
        storageKey: `tests/transcode/${video.id}/${randomUUID()}`,
        contentType: 'video/mp4',
        sizeBytes: 123n,
      },
    });
    const data = await stageTranscodingAttempt(video.id);
    assert.deepEqual(data, { contractVersion: 1, videoId: video.id, processingVersion: 1 });
    const staged = await prisma.video.findUniqueOrThrow({ where: { id: video.id } });
    assert.equal(staged.status, 'QUEUED');
    assert.equal(staged.processingVersion, 1);
    const pending = await prisma.videoTranscodeOutbox.findUniqueOrThrow({
      where: { videoId_processingVersion: { videoId: video.id, processingVersion: 1 } },
    });
    assert.equal(pending.status, 'PENDING');
    assert.equal(pending.jobId, `transcode-${video.id}-1`);
    await assert.rejects(stageTranscodingAttempt(video.id));
    assert.equal(await prisma.videoTranscodeOutbox.count({ where: { videoId: video.id } }), 1);

    // Force a uniqueness error on the next attempt and verify DB transaction rollback.
    await prisma.video.update({ where: { id: video.id }, data: { status: 'UPLOADED' } });
    await prisma.videoTranscodeOutbox.create({
      data: {
        videoId: video.id,
        processingVersion: 2,
        jobId: `transcode-${video.id}-2`,
      },
    });
    await assert.rejects(stageTranscodingAttempt(video.id));
    const unchanged = await prisma.video.findUniqueOrThrow({ where: { id: video.id } });
    assert.equal(unchanged.status, 'UPLOADED');
    assert.equal(unchanged.processingVersion, 1);
  } finally {
    if (videoId) {
      await prisma.videoTranscodeOutbox.deleteMany({ where: { videoId } });
      await prisma.mediaAsset.deleteMany({ where: { videoId } });
      await prisma.video.delete({ where: { id: videoId } });
    }
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
