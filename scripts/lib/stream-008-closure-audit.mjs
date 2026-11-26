/** STREAM-008.9 pure audit helpers: inspect path NAMES only, never read secrets. */
import { existsSync } from 'node:fs';
import path from 'node:path';

export const REQUIRED_FILES = Object.freeze([
  'pnpm-workspace.yaml',
  'scripts/verify-stream-008-7.mjs',
  'scripts/verify-stream-008-8.mjs',
  'scripts/run-stream-008-8.mjs',
  'apps/api/prisma/migrations/20261126133000_playback_analytics_sessions/migration.sql',
  'apps/api/tests/integration/creator-analytics.http.test.mjs',
  'apps/web/tests/e2e/creator-analytics.spec.ts',
  'apps/web/src/features/creator/components/CreatorVideoAnalyticsDetail.tsx',
  'docs/stream-008-milestone-closure.md',
]);

export function missingRequiredFiles(root, names = REQUIRED_FILES) {
  return names.filter((name) => !existsSync(path.join(root, name)));
}

export function auditTrackedPaths(paths) {
  const secrets = [];
  const generated = [];
  const review = [];
  for (const original of paths) {
    const normalized = original.replaceAll('\\', '/');
    const base = path.posix.basename(normalized);
    const lower = normalized.toLowerCase();
    const baseLower = base.toLowerCase();
    // Allow env *templates* (including .env.production.example), not actual env files.
    if (/^\.env(?:\.|$)/.test(baseLower) && !/\.(?:example|sample|template)$/.test(baseLower)) {
      secrets.push(original);
    }
    if (
      /(^|\/)(?:test-results|playwright-report|coverage)(\/|$)/.test(lower) ||
      /(^|\/)trace\.zip$/.test(lower) ||
      /(^|\/)\.auth\/(?:[^/]+\.json)$/.test(lower) ||
      /(^|\/)(?:storage-state|storagestate|auth-state)\.json$/.test(lower)
    ) {
      generated.push(original);
    }
    if (/\.(?:pem|p12|pfx|key)$/.test(baseLower) || /^(?:id_rsa|id_ed25519)$/.test(baseLower)) {
      review.push(original);
    }
  }
  return { secrets, generated, review };
}

export function missingWritableE2eConfig(env) {
  const fields = [
    'STREAMLAB_E2E_PLAYBACK_EMAIL',
    'STREAMLAB_E2E_PLAYBACK_PASSWORD',
    'STREAMLAB_E2E_ANALYTICS_VIDEO_ID',
  ];
  const missing = fields.filter((name) => !env[name]?.trim());
  if (env.STREAMLAB_E2E_ANALYTICS_WRITE !== '1') {
    missing.push('STREAMLAB_E2E_ANALYTICS_WRITE=1');
  }
  const id = env.STREAMLAB_E2E_ANALYTICS_VIDEO_ID;
  if (id && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
    missing.push('STREAMLAB_E2E_ANALYTICS_VIDEO_ID must be a UUID');
  }
  return missing;
}
