import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Job } from 'bullmq';
import {
  VIDEO_PROCESSING_SMOKE_JOB_NAME,
  type QueueSmokeJobData,
  type QueueSmokeJobResult,
} from '@streamlab/contracts';
import { processSmokeJob } from '../../src/processors/smoke.processor.js';

type SmokeJob = Job<QueueSmokeJobData, QueueSmokeJobResult>;

function fixture(overrides: Record<string, unknown> = {}): SmokeJob {
  return {
    id: 'smoke-test',
    name: VIDEO_PROCESSING_SMOKE_JOB_NAME,
    data: { requestId: 'test-request', queuedAt: new Date().toISOString() },
    attemptsMade: 0,
    ...overrides,
  } as SmokeJob;
}

test('returns an echoed smoke result without contacting Redis', async () => {
  const output = await processSmokeJob(fixture());
  assert.equal(output.requestId, 'test-request');
  assert.equal(output.workerPid, process.pid);
  assert.ok(!Number.isNaN(Date.parse(output.processedAt)));
});

test('rejects unsupported job names', async () => {
  await assert.rejects(processSmokeJob(fixture({ name: 'video.process' })), /Unsupported job/);
});

test('rejects invalid payloads', async () => {
  await assert.rejects(
    processSmokeJob(fixture({ data: { queuedAt: 'bad' } })),
    /Invalid smoke job/,
  );
});

test('retries a simulated first failure and succeeds on the next attempt', async () => {
  const data = {
    requestId: 'retry-request',
    queuedAt: new Date().toISOString(),
    failFirstAttempt: true,
  };
  await assert.rejects(processSmokeJob(fixture({ data, attemptsMade: 0 })), /Simulated/);
  const result = await processSmokeJob(fixture({ data, attemptsMade: 1 }));
  assert.equal(result.requestId, 'retry-request');
});
