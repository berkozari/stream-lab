import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectVideoQueueMetrics,
  startQueueMetricsPolling,
  type QueueMetricsReader,
} from '../../src/observability/queue-metrics.js';

const sampleCounts = { waiting: 2, active: 1, delayed: 3, failed: 4 };
const sample = { ...sampleCounts, paused: true };

test('collects only aggregate BullMQ counters with no user/job payload', async () => {
  let observedStates: unknown[] = [];
  const queue = {
    getJobCounts: async (...states: unknown[]) => {
      observedStates = states;
      return { ...sampleCounts, completed: 10, secret: 'must not leak' };
    },
    isPaused: async () => true,
  } as unknown as QueueMetricsReader;
  assert.deepEqual(await collectVideoQueueMetrics(queue), sample);
  assert.deepEqual(observedStates, ['waiting', 'active', 'delayed', 'failed']);
});

test('reports resumed queues with paused: false', async () => {
  const queue = {
    getJobCounts: async () => sampleCounts,
    isPaused: async () => false,
  } as unknown as QueueMetricsReader;
  assert.deepEqual(await collectVideoQueueMetrics(queue), { ...sampleCounts, paused: false });
});

test('rejects malformed and negative counters', async () => {
  const queue = {
    getJobCounts: async () => ({ ...sampleCounts, failed: -1 }),
    isPaused: async () => true,
  } as unknown as QueueMetricsReader;
  await assert.rejects(collectVideoQueueMetrics(queue), /Invalid BullMQ queue count/);
});

test('rejects a malformed queue pause flag', async () => {
  const queue = {
    getJobCounts: async () => sampleCounts,
    isPaused: async () => 'yes',
  } as unknown as QueueMetricsReader;
  await assert.rejects(collectVideoQueueMetrics(queue), /Invalid BullMQ pause status/);
});

test('propagates failures when reading queue pause status', async () => {
  const queue = {
    getJobCounts: async () => sampleCounts,
    isPaused: async () => {
      throw new Error('Redis unavailable');
    },
  } as unknown as QueueMetricsReader;
  await assert.rejects(collectVideoQueueMetrics(queue), /Redis unavailable/);
});

test('rejects invalid polling intervals', () => {
  for (const intervalMs of [0, -1, 600_001, 1.5]) {
    assert.throws(
      () =>
        startQueueMetricsPolling({
          intervalMs,
          collect: async () => sample,
          onSnapshot() {},
          onError() {},
        }),
      RangeError,
    );
  }
});

test('stops polling before a delayed result can be published', async () => {
  let release!: (value: typeof sample) => void;
  let started!: () => void;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = new Promise<typeof sample>((resolve) => {
    release = resolve;
  });
  const received: unknown[] = [];
  const stop = startQueueMetricsPolling({
    intervalMs: 1,
    collect: () => {
      started();
      return pending;
    },
    onSnapshot: (metrics) => {
      received.push(metrics);
    },
    onError: (error) => {
      throw error;
    },
  });
  const guard = setTimeout(() => {
    throw new Error('Queue metrics poll did not start');
  }, 1_000);
  try {
    await began;
  } finally {
    clearTimeout(guard);
  }
  const closing = stop();
  release(sample);
  await closing;
  assert.deepEqual(received, []);
});
