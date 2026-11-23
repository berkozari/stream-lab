import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = (rel) => JSON.parse(readFileSync(resolve(root, rel), 'utf8'));
const rootPkg = manifest('package.json');
const api = manifest('apps/api/package.json');
const worker = manifest('apps/worker/package.json');
const contracts = manifest('packages/contracts/package.json');

for (const rel of [
  'apps/api/src/lib/video-processing-queue.ts',
  'apps/api/scripts/queue-smoke.ts',
  'apps/worker/src/config/env.ts',
  'apps/worker/src/jobs/video-processing.worker.ts',
  'apps/worker/src/processors/smoke.processor.ts',
  'apps/worker/tests/unit/smoke.processor.test.ts',
  'packages/contracts/src/queue.ts',
  'docs/development/worker-foundation.md',
])
  assert.ok(existsSync(resolve(root, rel)), `Missing file: ${rel}`);

assert.ok(
  readFileSync(resolve(root, 'apps/worker/src/index.ts'), 'utf8').includes(
    'startVideoProcessingWorker',
  ),
);
assert.ok(
  readFileSync(resolve(root, 'packages/contracts/src/index.ts'), 'utf8').includes("'./queue.js'"),
);
assert.equal(api.name, '@streamlab/api');
assert.equal(worker.name, '@streamlab/worker');
assert.equal(contracts.name, '@streamlab/contracts');
for (const name of ['bullmq', 'ioredis'])
  assert.ok(api.dependencies?.[name], `API dependency missing: ${name}`);
for (const name of ['bullmq', 'ioredis', 'dotenv', '@streamlab/contracts']) {
  assert.ok(worker.dependencies?.[name], `Worker dependency missing: ${name}`);
}
assert.ok(api.scripts?.['queue:smoke'], 'API queue:smoke script missing');
assert.ok(worker.scripts?.['test:foundation'], 'Worker test:foundation script missing');
for (const key of ['smoke:queue', 'test:worker:foundation', 'verify:worker:foundation']) {
  assert.ok(rootPkg.scripts?.[key], `Root script missing: ${key}`);
}
console.info(
  'PASS: STREAM-001.8 source files, direct dependencies, shared contracts, and scripts exist.',
);
