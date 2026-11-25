import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

/** Opt-in: use only a migrated disposable PostgreSQL development database. */
test('verified upload, original asset, QUEUED status and outbox commit atomically', async (t) => {
  if (process.env.STREAMLAB_TEST_DB !== '1') {
    t.skip('Set STREAMLAB_TEST_DB=1 against a disposable PostgreSQL database');
    return;
  }
  const [{ prisma }, { finalizeOwnedUpload }] = await Promise.all([
    import('../../src/config/database.js'),
    import('../../src/repositories/upload-complete.repository.js'),
  ]);
  const user = await prisma.user.create({
    data: {
      email: `streamlab-0055-${randomUUID()}@example.invalid`,
      displayName: 'Auto Transcode',
      passwordHash: 'test-only',
    },
  });
  const ids: string[] = [];
  const makeUpload = async () => {
    const video = await prisma.video.create({
      data: { ownerId: user.id, title: 'Upload', status: 'UPLOADING' },
    });
    ids.push(video.id);
    const session = await prisma.videoUpload.create({
      data: {
        videoId: video.id,
        uploadMode: 'SINGLE',
        storageKey: `test-staging/${video.id}`,
        status: 'INITIATED',
        expectedSizeBytes: 64n,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    return { video, session };
  };
  try {
    const first = await makeUpload();
    const input = {
      uploadId: first.session.id,
      videoId: first.video.id,
      expectedSizeBytes: 64n,
      checksumSha256: null,
    };
    const verified = {
      storageKey: `test-verified/${first.video.id}`,
      contentType: 'video/mp4' as const,
      sizeBytes: 64n,
    };
    await finalizeOwnedUpload(input, user.id, verified);
    const [video, upload, asset, outbox] = await Promise.all([
      prisma.video.findUniqueOrThrow({ where: { id: first.video.id } }),
      prisma.videoUpload.findUniqueOrThrow({ where: { id: first.session.id } }),
      prisma.mediaAsset.findFirst({ where: { videoId: first.video.id, kind: 'ORIGINAL' } }),
      prisma.videoTranscodeOutbox.findFirst({ where: { videoId: first.video.id } }),
    ]);
    assert.equal(video.status, 'QUEUED');
    assert.equal(video.processingVersion, 1);
    assert.equal(upload.status, 'VERIFIED');
    assert.equal(asset?.storageKey, verified.storageKey);
    assert.equal(outbox?.status, 'PENDING');
    assert.equal(outbox?.jobId, `transcode-${first.video.id}-1`);
    await assert.rejects(finalizeOwnedUpload(input, user.id, verified));
    assert.equal(
      await prisma.videoTranscodeOutbox.count({ where: { videoId: first.video.id } }),
      1,
    );

    // Simulate a duplicate-version outbox insert. It must roll back the entire
    // upload finalization, not leave an apparently verified video without a job.
    const second = await makeUpload();
    await prisma.videoTranscodeOutbox.create({
      data: {
        videoId: second.video.id,
        processingVersion: 1,
        jobId: `transcode-${second.video.id}-1`,
      },
    });
    await assert.rejects(
      finalizeOwnedUpload(
        {
          uploadId: second.session.id,
          videoId: second.video.id,
          expectedSizeBytes: 64n,
          checksumSha256: null,
        },
        user.id,
        {
          storageKey: `test-verified/${second.video.id}`,
          contentType: 'video/mp4',
          sizeBytes: 64n,
        },
      ),
    );
    const unchangedVideo = await prisma.video.findUniqueOrThrow({ where: { id: second.video.id } });
    const unchangedSession = await prisma.videoUpload.findUniqueOrThrow({
      where: { id: second.session.id },
    });
    assert.equal(unchangedVideo.status, 'UPLOADING');
    assert.equal(unchangedVideo.processingVersion, 0);
    assert.equal(unchangedSession.status, 'INITIATED');
    assert.equal(await prisma.mediaAsset.count({ where: { videoId: second.video.id } }), 0);
  } finally {
    for (const videoId of ids) {
      await prisma.videoTranscodeOutbox.deleteMany({ where: { videoId } });
      await prisma.mediaAsset.deleteMany({ where: { videoId } });
      await prisma.videoUpload.deleteMany({ where: { videoId } });
      await prisma.video.deleteMany({ where: { id: videoId } });
    }
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
