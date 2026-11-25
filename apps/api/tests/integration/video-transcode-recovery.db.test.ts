import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

/** Run only against a disposable, migrated test database; modifies persisted rows. */
test('expired worker lease + missing Redis job -> QUEUED and PENDING atomically', async (t) => {
  if (process.env.STREAMLAB_TEST_DB !== '1') {
    t.skip('Set STREAMLAB_TEST_DB=1 against a disposable PostgreSQL database');
    return;
  }
  const [{ prisma }, { findTranscodingRecoveryCandidates, applyTranscodingRecovery }] =
    await Promise.all([
      import('../../src/config/database.js'),
      import('../../src/repositories/video-transcode-recovery.repository.js'),
    ]);
  const user = await prisma.user.create({
    data: {
      email: `streamlab-recovery-${randomUUID()}@example.invalid`,
      displayName: 'Recovery Test',
      passwordHash: 'test-only',
    },
  });
  const leaseToken = randomUUID();
  const old = new Date(Date.now() - 10 * 60_000);
  let videoId: string | undefined;
  try {
    const video = await prisma.video.create({
      data: {
        ownerId: user.id,
        title: 'Expired worker',
        status: 'PROCESSING',
        processingVersion: 1,
        processingLeaseToken: leaseToken,
        processingLeaseExpiresAt: old,
      },
    });
    videoId = video.id;
    const outbox = await prisma.videoTranscodeOutbox.create({
      data: {
        videoId: video.id,
        processingVersion: 1,
        jobId: `transcode-${video.id}-1`,
        status: 'DISPATCHED',
        dispatchedAt: old,
      },
    });
    const candidates = await findTranscodingRecoveryCandidates(100);
    const c = candidates.find((candidate) => candidate.id === outbox.id);
    assert.ok(c, 'eligible expired lease must be selected');
    assert.equal(c?.leaseToken, leaseToken);

    // Simulate another worker renewing the lease after Redis lookup, before CAS.
    await prisma.video.update({
      where: { id: video.id },
      data: { processingLeaseExpiresAt: new Date(Date.now() + 60_000) },
    });
    assert.equal(await applyTranscodingRecovery(c, 'redispatch'), false);
    assert.equal(
      (await prisma.videoTranscodeOutbox.findUniqueOrThrow({ where: { id: outbox.id } })).status,
      'DISPATCHED',
    );

    await prisma.video.update({ where: { id: video.id }, data: { processingLeaseExpiresAt: old } });
    assert.equal(await applyTranscodingRecovery(c, 'redispatch'), true);
    const [updatedVideo, updatedOutbox] = await Promise.all([
      prisma.video.findUniqueOrThrow({ where: { id: video.id } }),
      prisma.videoTranscodeOutbox.findUniqueOrThrow({ where: { id: outbox.id } }),
    ]);
    assert.equal(updatedVideo.status, 'QUEUED');
    assert.equal(updatedVideo.processingLeaseToken, null);
    assert.equal(updatedOutbox.status, 'PENDING');
    assert.equal(updatedOutbox.jobId, `transcode-${video.id}-1`);
    assert.equal(await applyTranscodingRecovery(c, 'redispatch'), false);

    // Now simulate a redispatched job that exhausted BullMQ retries without
    // successfully releasing its DB lease. Recovery must finalize FAILED.
    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: 'PROCESSING',
        processingLeaseToken: leaseToken,
        processingLeaseExpiresAt: old,
      },
    });
    await prisma.videoTranscodeOutbox.update({
      where: { id: outbox.id },
      data: { status: 'DISPATCHED', dispatchedAt: old },
    });
    assert.equal(await applyTranscodingRecovery(c, 'terminal-failed'), true);
    const failedVideo = await prisma.video.findUniqueOrThrow({ where: { id: video.id } });
    const failedOutbox = await prisma.videoTranscodeOutbox.findUniqueOrThrow({
      where: { id: outbox.id },
    });
    assert.equal(failedVideo.status, 'FAILED');
    assert.equal(failedOutbox.lastErrorCode, 'JOB_TERMINAL_FAILED');
    assert.equal(failedOutbox.status, 'DISPATCHED');
  } finally {
    if (videoId) {
      await prisma.videoTranscodeOutbox.deleteMany({ where: { videoId } });
      await prisma.video.delete({ where: { id: videoId } });
    }
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
