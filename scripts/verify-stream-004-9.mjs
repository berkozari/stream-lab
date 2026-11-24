import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const files = [
  'apps/web/tests/e2e/upload-security.spec.ts',
  'apps/api/scripts/upload-e2e-cleanup.ts',
  'docs/development/stream-004-9-upload-e2e.md',
];
for (const file of files) assert.ok(existsSync(resolve(root, file)), `Missing ${file}`);
const test = readFileSync(resolve(root, files[0]), 'utf8');
const cleanup = readFileSync(resolve(root, files[1]), 'utf8');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
assert.ok(test.includes('StreamLab-Upload-E2E-2026-Strong!'), 'Test registration flow changed');
assert.ok(test.includes('streamlab-upload-e2e-'), 'Missing isolated test identity');
assert.ok(test.includes('sawUnsignedS3Request'), 'Missing S3 credential-leak assertions');
assert.ok(test.includes('STREAMLAB_E2E_LARGE_UPLOAD'), 'Missing explicit large-upload gate');
assert.ok(cleanup.includes('expected.test(email)'), 'Cleanup must validate isolated test prefix');
assert.ok(
  cleanup.includes('removeVerified') && cleanup.includes('deleteStaging'),
  'Missing S3 cleanup',
);
assert.equal(pkg.scripts['verify:upload:e2e'], 'node scripts/verify-stream-004-9.mjs');
assert.equal(
  pkg.scripts['test:upload:e2e'],
  'pnpm exec playwright test apps/web/tests/e2e/upload-security.spec.ts',
);
assert.ok(pkg.scripts.check.includes('pnpm verify:upload:e2e'), 'Missing check integration');
console.log('PASS: STREAM-004.9 browser E2E files, scoped cleanup and scripts are present.');
console.log('NOTE: Real browser tests require PostgreSQL, SILO, API, web and Chromium.');
