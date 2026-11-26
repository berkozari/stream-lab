/** Pure repository policy helpers for STREAM-007.8. No credentials or file contents are read. */
import { existsSync } from 'node:fs';
import path from 'node:path';

export const REQUIRED_FILES = Object.freeze([
  'scripts/verify-stream-007-6.mjs',
  'scripts/run-stream-007-6.mjs',
  'apps/api/tests/integration/watch-progress.http.test.mjs',
  'apps/web/tests/e2e/discovery-watch-history.spec.ts',
  'apps/api/src/lib/discovery-search-pattern.ts',
  'apps/api/tests/unit/discovery-search-pattern.test.ts',
  'apps/api/src/lib/video-publication.ts',
  'apps/api/tests/unit/video-publication.test.ts',
  'docs/stream-007-security-performance-review.md',
  'docs/stream-007-publication-fix.md',
  'docs/stream-007-milestone-closure.md',
]);

export function missingRequiredFiles(root, files = REQUIRED_FILES) {
  return files.filter((name) => !existsSync(path.join(root, name)));
}

/** Classify tracked Git paths; do not inspect/read secret contents. */
export function auditTrackedPaths(files) {
  const secrets = [];
  const generated = [];
  const inspect = [];
  for (const original of files) {
    const file = original.replaceAll('\\', '/');
    const base = path.posix.basename(file);
    if (/^\.env(?:\.|$)/i.test(base) && !/^\.env\.(example|sample|template)$/i.test(base)) {
      secrets.push(original);
    }
    if (
      /(^|\/)(test-results|playwright-report)(\/|$)/.test(file) ||
      /(^|\/)trace\.zip$/i.test(file)
    ) {
      generated.push(original);
    }
    if (/\.(?:pem|p12|pfx|key)$/i.test(base) && !/\.(?:example|sample|template)\./i.test(base)) {
      inspect.push(original);
    }
  }
  return { secrets, generated, inspect };
}

export function missingFullE2eConfig(env) {
  const required = [
    'STREAMLAB_E2E_PLAYBACK_EMAIL',
    'STREAMLAB_E2E_PLAYBACK_PASSWORD',
    'STREAMLAB_E2E_PLAYBACK_VIDEO_ID',
  ];
  const missing = required.filter((key) => !env[key]?.trim());
  if (env.STREAMLAB_E2E_WATCH_WRITE !== '1') missing.push('STREAMLAB_E2E_WATCH_WRITE=1');
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (env.STREAMLAB_E2E_PLAYBACK_VIDEO_ID && !uuid.test(env.STREAMLAB_E2E_PLAYBACK_VIDEO_ID)) {
    missing.push('STREAMLAB_E2E_PLAYBACK_VIDEO_ID must be a real UUID');
  }
  return missing;
}
