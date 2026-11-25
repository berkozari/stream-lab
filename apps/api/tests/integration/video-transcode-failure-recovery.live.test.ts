import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { test } from 'node:test';

/**
 * STREAM-005.6D: Real PostgreSQL + Redis/BullMQ tests, never the application queue.
 * Only runs against an explicitly selected, migrated disposable *_test database.
 * Each case uses a unique BullMQ queue. No Redis FLUSHDB or shared queue deletion.
 */
test('real BullMQ + PostgreSQL transcoding recovery failure scenarios', async (t) => {
  if (process.env.STREAMLAB_TEST_DB !== '1' || process.env.STREAMLAB_TEST_REDIS !== '1') {
    t.skip('Requires STREAMLAB_TEST_DB=1 and STREAMLAB_TEST_REDIS=1 with disposable services');
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Recovery fault tests are disabled in production');
  }

  const { getDatabaseUrl } = await import('../../src/config/database-url.js');
  const databaseName = decodeURIComponent(new URL(getDatabaseUrl()).pathname.slice(1));
  if (!/(?:^|[_-])test$/iu.test(databaseName)) {
    throw new Error('Refusing fault tests: DATABASE_URL must target a database named *_test');
  }

  const [bull, redisModule, database, recoveryRepository, recoveryService, envModule] =
    await Promise.all([
      import('bullmq'),
      import('ioredis'),
      import('../../src/config/database.js'),
      import('../../src/repositories/video-transcode-recovery.repository.js'),
      import('../../src/services/video-transcode-recovery.service.js'),
      import('../../src/config/env.js'),
    ]);
  const { Queue, Worker } = bull;
  const { Redis } = redisModule;
  const { prisma } = database;
  const { findTranscodingRecoveryCandidates, applyTranscodingRecovery } = recoveryRepository;
  const { createReconcileTranscodingJobs } = recoveryService;
  const redisUrl = envModule.redisUrl;
  const videoIds: string[] = [];

  // One isolated owner is created solely for these fixtures.
  const owner = await prisma.user.create({
    data: {
      email: `streamlab-0056d-${randomUUID()}@example.invalid`,
      displayName: 'Recovery Fixture',
      passwordHash: 'test-only',
    },
  });

  t.after(async () => {
    try {
      for (const videoId of videoIds) {
        await prisma.videoTranscodeOutbox.deleteMany({ where: { videoId } });
        await prisma.video.deleteMany({ where: { id: videoId } });
      }
      await prisma.user.delete({ where: { id: owner.id } });
    } finally {
      await prisma.$disconnect();
    }
  });

  const makeFixture = async (status: 'QUEUED' | 'PROCESSING' = 'PROCESSING') => {
    const old = new Date(Date.now() - 10 * 60_000);
    const video = await prisma.video.create({
      data: {
        ownerId: owner.id,
        title: '005.6D test',
        status,
        processingVersion: 1,
        processingLeaseToken: status === 'PROCESSING' ? randomUUID() : null,
        processingLeaseExpiresAt: status === 'PROCESSING' ? old : null,
      },
    });
    videoIds.push(video.id);
    const jobId = `transcode-${video.id}-1`;
    const outbox = await prisma.videoTranscodeOutbox.create({
      data: {
        videoId: video.id,
        processingVersion: 1,
        jobId,
        status: 'DISPATCHED',
        dispatchedAt: old,
      },
    });
    return { videoId: video.id, outboxId: outbox.id, jobId };
  };

  const withQueue = async (
    run: (ctx: {
      queue: InstanceType<typeof Queue>;
      makeJob: (jobId: string) => Promise<void>;
      workerConnection: () => InstanceType<typeof Redis>;
    }) => Promise<void>,
  ) => {
    // A unique queue isolates all fault injections from the real StreamLab worker.
    const queueName = `sl-0056d-${randomUUID()}`;
    const connection = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    connection.on('error', () => {});
    const queue = new Queue(queueName, { connection });
    const workerConnections: Array<InstanceType<typeof Redis>> = [];
    const workerConnection = () => {
      const client = new Redis(redisUrl, { maxRetriesPerRequest: null });
      client.on('error', () => {});
      workerConnections.push(client);
      return client;
    };
    const makeJob = async (jobId: string) => {
      const parts = /^transcode-([0-9a-f-]{36})-1$/u.exec(jobId);
      assert.ok(parts);
      await queue.add(
        'video.transcode',
        {
          contractVersion: 1,
          videoId: parts[1],
          processingVersion: 1,
        },
        { jobId, attempts: 1, removeOnFail: false, removeOnComplete: false },
      );
    };
    try {
      await queue.waitUntilReady();
      await run({ queue, makeJob, workerConnection });
    } finally {
      // Only remove the unique test queue, never the production application queue.
      try {
        await queue.obliterate({ force: true });
      } finally {
        await queue.close();
        connection.disconnect();
        for (const client of workerConnections) client.disconnect();
      }
    }
  };

  const reconcileFixture = async (videoId: string, state: (id: string) => Promise<string>) => {
    const candidates = (await findTranscodingRecoveryCandidates(100)).filter(
      (item) => item.videoId === videoId,
    );
    assert.equal(candidates.length, 1, 'dispatched, expired DB fixture must be eligible');
    return createReconcileTranscodingJobs({
      find: async () => candidates,
      state,
      apply: applyTranscodingRecovery,
    })();
  };

  await t.test('missing BullMQ job: expired lease is recovered atomically', async () => {
    const fixture = await makeFixture();
    await withQueue(async ({ queue }) => {
      assert.equal(await queue.getJobState(fixture.jobId), 'unknown');
      const result = await reconcileFixture(fixture.videoId, (id) => queue.getJobState(id));
      assert.equal(result.redispatched, 1);
      const [video, outbox] = await Promise.all([
        prisma.video.findUniqueOrThrow({ where: { id: fixture.videoId } }),
        prisma.videoTranscodeOutbox.findUniqueOrThrow({ where: { id: fixture.outboxId } }),
      ]);
      assert.equal(video.status, 'QUEUED');
      assert.equal(video.processingLeaseToken, null);
      assert.equal(video.processingVersion, 1);
      assert.equal(outbox.status, 'PENDING');
      assert.equal(outbox.jobId, fixture.jobId);
    });
  });

  await t.test(
    'waiting BullMQ job: DB and its lease are preserved; duplicate ID is deduplicated',
    async () => {
      const fixture = await makeFixture();
      await withQueue(async ({ queue, makeJob }) => {
        await makeJob(fixture.jobId);
        await makeJob(fixture.jobId);
        assert.equal(await queue.getJobState(fixture.jobId), 'waiting');
        assert.equal((await queue.getJobCounts('waiting')).waiting, 1);
        const summary = await reconcileFixture(fixture.videoId, (id) => queue.getJobState(id));
        assert.equal(summary.preserved, 1);
        assert.equal(
          (await prisma.video.findUniqueOrThrow({ where: { id: fixture.videoId } })).status,
          'PROCESSING',
        );
        assert.equal(
          (await prisma.videoTranscodeOutbox.findUniqueOrThrow({ where: { id: fixture.outboxId } }))
            .status,
          'DISPATCHED',
        );
      });
    },
  );

  await t.test('failed BullMQ job: terminal failure is reflected in PostgreSQL', async () => {
    const fixture = await makeFixture();
    await withQueue(async ({ queue, makeJob, workerConnection }) => {
      const worker = new Worker(
        queue.name,
        async () => {
          throw new Error('SIMULATED_FFMPEG_FAILURE');
        },
        { connection: workerConnection(), concurrency: 1 },
      );
      worker.on('error', () => {});
      try {
        await worker.waitUntilReady();
        await makeJob(fixture.jobId);
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline && (await queue.getJobState(fixture.jobId)) !== 'failed') {
          await sleep(100);
        }
        assert.equal(await queue.getJobState(fixture.jobId), 'failed');
      } finally {
        await worker.close();
      }
      const summary = await reconcileFixture(fixture.videoId, (id) => queue.getJobState(id));
      assert.equal(summary.terminalFailed, 1);
      assert.equal(
        (await prisma.video.findUniqueOrThrow({ where: { id: fixture.videoId } })).status,
        'FAILED',
      );
      assert.equal(
        (await prisma.videoTranscodeOutbox.findUniqueOrThrow({ where: { id: fixture.outboxId } }))
          .lastErrorCode,
        'JOB_TERMINAL_FAILED',
      );
    });
  });

  await t.test('completed job without READY commit is a terminal inconsistency', async () => {
    const fixture = await makeFixture();
    await withQueue(async ({ queue, makeJob, workerConnection }) => {
      const worker = new Worker(queue.name, async () => ({ outcome: 'injected-success' }), {
        connection: workerConnection(),
        concurrency: 1,
      });
      worker.on('error', () => {});
      try {
        await worker.waitUntilReady();
        await makeJob(fixture.jobId);
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline && (await queue.getJobState(fixture.jobId)) !== 'completed') {
          await sleep(100);
        }
        assert.equal(await queue.getJobState(fixture.jobId), 'completed');
      } finally {
        await worker.close();
      }
      const summary = await reconcileFixture(fixture.videoId, (id) => queue.getJobState(id));
      assert.equal(summary.terminalFailed, 1);
      assert.equal(
        (await prisma.video.findUniqueOrThrow({ where: { id: fixture.videoId } })).status,
        'FAILED',
      );
      assert.equal(
        (await prisma.videoTranscodeOutbox.findUniqueOrThrow({ where: { id: fixture.outboxId } }))
          .lastErrorCode,
        'JOB_COMPLETED_WITHOUT_READY',
      );
    });
  });

  await t.test('lease renewal during Redis lookup prevents stale recovery commit', async () => {
    const fixture = await makeFixture();
    const summary = await reconcileFixture(fixture.videoId, async () => {
      await prisma.video.update({
        where: { id: fixture.videoId },
        data: { processingLeaseExpiresAt: new Date(Date.now() + 60_000) },
      });
      return 'unknown';
    });
    assert.equal(summary.raced, 1);
    assert.equal(summary.redispatched, 0);
    assert.equal(
      (await prisma.video.findUniqueOrThrow({ where: { id: fixture.videoId } })).status,
      'PROCESSING',
    );
    assert.equal(
      (await prisma.videoTranscodeOutbox.findUniqueOrThrow({ where: { id: fixture.outboxId } }))
        .status,
      'DISPATCHED',
    );
  });

  await t.test('simulated Redis lookup outage: no PostgreSQL state changes', async () => {
    const fixture = await makeFixture();
    const before = await prisma.video.findUniqueOrThrow({ where: { id: fixture.videoId } });
    const summary = await reconcileFixture(fixture.videoId, async () => {
      throw new Error('SIMULATED_REDIS_UNAVAILABLE');
    });
    assert.equal(summary.errors, 1);
    const [video, outbox] = await Promise.all([
      prisma.video.findUniqueOrThrow({ where: { id: fixture.videoId } }),
      prisma.videoTranscodeOutbox.findUniqueOrThrow({ where: { id: fixture.outboxId } }),
    ]);
    assert.equal(video.status, before.status);
    assert.equal(video.processingLeaseToken, before.processingLeaseToken);
    assert.equal(outbox.status, 'DISPATCHED');
  });
});
