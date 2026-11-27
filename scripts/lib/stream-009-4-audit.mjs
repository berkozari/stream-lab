import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function auditAnalyticsLifecycle(root) {
  const read = (name) => readFile(join(root, name), 'utf8');
  const [schema, migration, repo, cli, creator, video, tests, docs] = await Promise.all([
    read('apps/api/prisma/schema.prisma'),
    read('apps/api/prisma/migrations/20261127100000_analytics_retention_archive/migration.sql'),
    read('apps/api/src/repositories/analytics-retention.repository.ts'),
    read('apps/api/scripts/analytics-retention.ts'),
    read('apps/api/src/repositories/creator-analytics.repository.ts'),
    read('apps/api/src/repositories/creator-video-analytics.repository.ts'),
    read('apps/api/tests/unit/analytics-retention.test.ts'),
    read('docs/stream-009.4-database-redis-analytics-lifecycle.md'),
  ]);
  const check = (name, passed, reason) => ({
    name,
    passed: Boolean(passed),
    ...(!passed ? { reason } : {}),
  });
  return [
    check(
      'Archive schema and video deletion relation',
      /model VideoAnalyticsArchive \{/.test(schema) &&
        /analyticsArchive VideoAnalyticsArchive\?/.test(schema) &&
        /onDelete: Cascade/.test(schema),
    ),
    check(
      'Additive migration and retention lookup index',
      /CREATE TABLE "VideoAnalyticsArchive"/.test(migration) &&
        /CREATE INDEX "PlaybackAnalyticsSession_lastEventAt_id_idx"/.test(migration) &&
        !/DROP TABLE|TRUNCATE|DELETE FROM/i.test(migration),
    ),
    check(
      'Batch lock, atomic deletion and archive upsert',
      /FOR UPDATE SKIP LOCKED/.test(repo) &&
        /DELETE FROM "PlaybackAnalyticsSession"/.test(repo) &&
        /ON CONFLICT \("videoId"\) DO UPDATE/.test(repo) &&
        /RETURNING s\."videoId"/.test(repo),
    ),
    check(
      'Retention timestamp guards and bounded batches',
      /"lastEventAt" < \$\{cutoff\}/.test(repo) &&
        /"startedAt" < \$\{cutoff\}/.test(repo) &&
        /LIMIT \$\{batchSize\}/.test(repo) &&
        /MAX_ANALYTICS_PURGE_BATCHES/.test(cli),
    ),
    check(
      'CLI dry-run default and explicit write acknowledgement',
      /apply: false/.test(cli) &&
        /ANALYTICS_RETENTION_APPLY_ACK/.test(cli) &&
        /if \(!opts\.apply\) return/.test(cli),
    ),
    check(
      'Archive-aware all-time creator and single-video queries',
      /if \(rangeStart\) return groups/.test(creator) &&
        /mergeQualifiedArchive/.test(creator) &&
        /mergeCompletedArchive/.test(creator) &&
        /since\s*\? Promise\.resolve\(null\)/.test(video),
    ),
    check(
      'Unit tests cover counters, windows and invalid limits',
      /mergeQualifiedArchive/.test(tests) &&
        /retention cutoff/.test(tests) &&
        /numeric options reject/.test(tests),
    ),
    check(
      'Documentation covers migration sequencing and rollback',
      /Do not purge until every API replica/.test(docs) &&
        /Rollback/.test(docs) &&
        /staging/.test(docs) &&
        /Redis/.test(docs),
    ),
  ];
}
