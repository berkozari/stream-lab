import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

process.env.DATABASE_URL ??= 'postgresql://unused:unused@127.0.0.1:5432/streamlab_unit';
const { createReconcileTranscodingJobs } =
  await import('../../src/services/video-transcode-recovery.service.js');
const videoId = randomUUID();
const candidate = {
  id: randomUUID(),
  videoId,
  jobId: `transcode-${videoId}-1`,
  processingVersion: 1,
  status: 'PROCESSING' as const,
  leaseToken: randomUUID(),
  leaseExpiresAt: new Date(Date.now() - 600_000),
};

test('worker crash + disappeared BullMQ job is durably restaged (same version)', async () => {
  const actions: string[] = [];
  const reconcile = createReconcileTranscodingJobs({
    find: async (limit) => {
      assert.equal(limit, 20);
      return [candidate];
    },
    state: async () => 'unknown',
    apply: async (entry, action) => {
      assert.deepEqual(entry, candidate);
      actions.push(action);
      return true;
    },
  });
  assert.deepEqual(await reconcile(), {
    checked: 1,
    redispatched: 1,
    terminalFailed: 0,
    preserved: 0,
    raced: 0,
    errors: 0,
  });
  assert.deepEqual(actions, ['redispatch']);
});

test('terminal BullMQ failures become FAILED; completed without READY is flagged', async () => {
  for (const state of ['failed', 'completed']) {
    const actions: string[] = [];
    const summary = await createReconcileTranscodingJobs({
      find: async () => [candidate],
      state: async () => state,
      apply: async (_candidate, action) => {
        actions.push(action);
        return true;
      },
    })();
    assert.equal(summary.terminalFailed, 1);
    assert.deepEqual(actions, [state === 'failed' ? 'terminal-failed' : 'completed-without-ready']);
  }
});

test('active/waiting/delayed/unknown future states are left to BullMQ', async () => {
  for (const state of [
    'active',
    'waiting',
    'delayed',
    'paused',
    'waiting-children',
    'some-future-state',
  ]) {
    let changed = false;
    const summary = await createReconcileTranscodingJobs({
      find: async () => [candidate],
      state: async () => state,
      apply: async () => {
        changed = true;
        return true;
      },
    })();
    assert.equal(changed, false);
    assert.equal(summary.preserved, 1);
  }
});

test('Redis offline does not alter the database', async () => {
  let changed = false;
  const summary = await createReconcileTranscodingJobs({
    find: async () => [candidate],
    state: async () => {
      throw new Error('ECONNREFUSED');
    },
    apply: async () => {
      changed = true;
      return true;
    },
  })();
  assert.equal(changed, false);
  assert.equal(summary.errors, 1);
});

test('DB CAS conflict does not report recovery as successful', async () => {
  const summary = await createReconcileTranscodingJobs({
    find: async () => [candidate],
    state: async () => 'unknown',
    apply: async () => false,
  })();
  assert.equal(summary.raced, 1);
  assert.equal(summary.redispatched, 0);
});

test('one failed candidate does not block later candidates', async () => {
  const second = { ...candidate, id: randomUUID() };
  const summary = await createReconcileTranscodingJobs({
    find: async () => [candidate, second],
    state: async () => 'unknown',
    apply: async (c) => {
      if (c.id === candidate.id) throw new Error('DB unavailable');
      return true;
    },
  })();
  assert.equal(summary.errors, 1);
  assert.equal(summary.redispatched, 1);
});
