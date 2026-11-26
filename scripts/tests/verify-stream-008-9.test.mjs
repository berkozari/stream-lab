import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditTrackedPaths,
  missingRequiredFiles,
  missingWritableE2eConfig,
} from '../lib/stream-008-closure-audit.mjs';

const validId = '52cb1b5c-68e3-4a7f-aa54-dc60836df071';

test('safe environment template filenames are allowed', () => {
  assert.deepEqual(
    auditTrackedPaths(['.env.example', 'apps/api/.env.production.sample', '.env.test.template'])
      .secrets,
    [],
  );
});

test('tracked environment files including nested variants are blocked', () => {
  assert.deepEqual(
    auditTrackedPaths(['.env', 'apps/api/.env.local', 'apps/web/.env.production']).secrets,
    ['.env', 'apps/api/.env.local', 'apps/web/.env.production'],
  );
});

test('playwright outputs and browser auth state are blocked', () => {
  const report = auditTrackedPaths([
    'test-results/video/trace.zip',
    'apps/web/playwright-report/index.html',
    'apps/web/.auth/user.json',
    'apps/web/storage-state.json',
    'apps/api/src/app.ts',
  ]);
  assert.equal(report.generated.length, 4);
});

test('normal source files are not classified as secrets or artifacts', () => {
  assert.deepEqual(
    auditTrackedPaths(['apps/api/src/app.ts', 'docs/stream-008-milestone-closure.md']),
    {
      secrets: [],
      generated: [],
      review: [],
    },
  );
});

test('private key filename is flagged for manual review', () => {
  assert.deepEqual(auditTrackedPaths(['keys/server.pem']).review, ['keys/server.pem']);
});

test('writable E2E requires explicit consent', () => {
  const missing = missingWritableE2eConfig({
    STREAMLAB_E2E_PLAYBACK_EMAIL: 'qa@example.test',
    STREAMLAB_E2E_PLAYBACK_PASSWORD: 'test-only',
    STREAMLAB_E2E_ANALYTICS_VIDEO_ID: validId,
  });
  assert.ok(missing.includes('STREAMLAB_E2E_ANALYTICS_WRITE=1'));
});

test('writable E2E refuses placeholder video IDs', () => {
  const missing = missingWritableE2eConfig({
    STREAMLAB_E2E_PLAYBACK_EMAIL: 'qa@example.test',
    STREAMLAB_E2E_PLAYBACK_PASSWORD: 'test-only',
    STREAMLAB_E2E_ANALYTICS_VIDEO_ID: '<READY-VIDEO-UUID>',
    STREAMLAB_E2E_ANALYTICS_WRITE: '1',
  });
  assert.ok(missing.some((m) => m.includes('must be a UUID')));
});

test('complete and valid writable E2E settings pass', () => {
  assert.deepEqual(
    missingWritableE2eConfig({
      STREAMLAB_E2E_PLAYBACK_EMAIL: 'qa@example.test',
      STREAMLAB_E2E_PLAYBACK_PASSWORD: 'test-only',
      STREAMLAB_E2E_ANALYTICS_VIDEO_ID: validId,
      STREAMLAB_E2E_ANALYTICS_WRITE: '1',
    }),
    [],
  );
});

test('missing file detection returns only absent paths', () => {
  assert.deepEqual(missingRequiredFiles('/tmp', ['this-path-should-not-exist-0089-xyz']), [
    'this-path-should-not-exist-0089-xyz',
  ]);
});
