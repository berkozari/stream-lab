import assert from 'node:assert/strict';
import test from 'node:test';
import { auditTrackedPaths, missingFullE2eConfig } from '../lib/stream-007-audit.mjs';

test('safe environment templates do not trigger leaked-secret alarm', () => {
  assert.deepEqual(
    auditTrackedPaths(['.env.example', 'apps/api/.env.sample', 'apps/web/.env.template']).secrets,
    [],
  );
});

test('actual tracked env files are rejected including nested files', () => {
  assert.deepEqual(
    auditTrackedPaths(['.env', 'apps/api/.env.local', 'apps/api/.env.production']).secrets,
    ['.env', 'apps/api/.env.local', 'apps/api/.env.production'],
  );
});

test('Playwright reports, test results and traces are detected', () => {
  const report = auditTrackedPaths([
    'test-results/test-failed-1.png',
    'apps/web/playwright-report/index.html',
    'test-results/spec/trace.zip',
    'src/index.ts',
  ]);
  assert.equal(report.generated.length, 3);
});

test('normal source files do not trigger secret/artifact alarms', () => {
  const report = auditTrackedPaths([
    'apps/api/src/app.ts',
    'packages/contracts/src/api/video.ts',
    'docs/stream-007-milestone-closure.md',
  ]);
  assert.deepEqual(report, { secrets: [], generated: [], inspect: [] });
});

test('full E2E without explicit write consent is refused', () => {
  const missing = missingFullE2eConfig({
    STREAMLAB_E2E_PLAYBACK_EMAIL: 'qa@example.test',
    STREAMLAB_E2E_PLAYBACK_PASSWORD: 'redacted',
    STREAMLAB_E2E_PLAYBACK_VIDEO_ID: '946acdaa-bb2d-423d-9176-820f9d568018',
  });
  assert.ok(missing.includes('STREAMLAB_E2E_WATCH_WRITE=1'));
});

test('full E2E validates fixture UUID without displaying secrets', () => {
  const missing = missingFullE2eConfig({
    STREAMLAB_E2E_PLAYBACK_EMAIL: 'qa@example.test',
    STREAMLAB_E2E_PLAYBACK_PASSWORD: 'redacted',
    STREAMLAB_E2E_PLAYBACK_VIDEO_ID: '<READY-VIDEO-UUID>',
    STREAMLAB_E2E_WATCH_WRITE: '1',
  });
  assert.ok(missing.some((value) => value.includes('real UUID')));
});

test('valid E2E variables pass preflight', () => {
  assert.deepEqual(
    missingFullE2eConfig({
      STREAMLAB_E2E_PLAYBACK_EMAIL: 'qa@example.test',
      STREAMLAB_E2E_PLAYBACK_PASSWORD: 'redacted',
      STREAMLAB_E2E_PLAYBACK_VIDEO_ID: '946acdaa-bb2d-423d-9176-820f9d568018',
      STREAMLAB_E2E_WATCH_WRITE: '1',
    }),
    [],
  );
});
