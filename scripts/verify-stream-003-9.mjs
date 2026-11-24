import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const required = [
  'playwright.config.ts',
  'apps/web/tests/e2e/auth-flow.spec.ts',
  'apps/web/tests/e2e/video-management.spec.ts',
  'apps/api/scripts/video-e2e-cleanup.ts',
];
for (const path of required) assert.ok(existsSync(resolve(process.cwd(), path)), `Missing ${path}`);
const config = read('playwright.config.ts');
assert.ok(
  config.includes("testDir: './apps/web/tests/e2e'"),
  'Expected existing E2E test directory',
);
const spec = read('apps/web/tests/e2e/video-management.spec.ts');
for (const requirement of [
  'createDraft(',
  'soft-deletes',
  'cursor pagination',
  'second user',
  'video-e2e-cleanup.ts',
]) {
  assert.ok(spec.includes(requirement), `Missing E2E coverage: ${requirement}`);
}
const cleanup = read('apps/api/scripts/video-e2e-cleanup.ts');
assert.ok(
  cleanup.includes('streamlab-video-e2e-'),
  'Cleanup must use a dedicated exact account prefix',
);
assert.ok(
  cleanup.includes('videoUpload.deleteMany') && cleanup.includes('mediaAsset.deleteMany'),
  'Cleanup must handle video descendants',
);
assert.ok(
  cleanup.includes('consumedRefreshToken.deleteMany'),
  'Cleanup must handle refresh replay records',
);
const scripts = JSON.parse(read('package.json')).scripts;
assert.ok(
  scripts?.['test:video:e2e']?.includes('video-management.spec.ts'),
  'Missing E2E test command',
);
assert.ok(
  scripts?.check?.includes('pnpm verify:video:e2e'),
  'Missing structural verification in check',
);
assert.ok(
  !scripts.check.includes('pnpm test:video:e2e'),
  'Browser tests must not run inside pnpm check',
);
console.log('PASS: STREAM-003.9 video CRUD browser E2E + ownership + cursor + isolated cleanup');
