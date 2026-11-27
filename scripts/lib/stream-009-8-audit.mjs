/** STREAM-009.8 pure, read-only final milestone helpers. Never read credential values. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditTrackedPaths } from './stream-008-closure-audit.mjs';

export const REQUIRED_FILES = Object.freeze([
  'pnpm-workspace.yaml',
  '.github/workflows/streamlab-ci.yml',
  'deploy/Dockerfile',
  'deploy/compose.production.yml',
  'scripts/production/preflight.mjs',
  'scripts/production/postgres-backup.sh',
  'apps/api/prisma/migrations/20261127100000_analytics_retention_archive/migration.sql',
  'scripts/run-stream-009-6.mjs',
  'scripts/verify-stream-009-8.mjs',
  'docs/stream-009-milestone-closure.md',
  ...Array.from({ length: 7 }, (_, index) => `scripts/verify-stream-009-${index + 1}.mjs`),
]);

export function missingRequiredFiles(root, files = REQUIRED_FILES) {
  return files.filter((file) => !existsSync(join(root, file)));
}

export function checkTrackedFiles(fileNames) {
  const result = auditTrackedPaths(fileNames);
  return {
    blocked: [...result.secrets, ...result.generated],
    review: result.review,
  };
}

export function auditClosureSources(root) {
  const read = (file) => {
    try {
      return readFileSync(join(root, file), 'utf8');
    } catch {
      return '';
    }
  };
  const workflow = read('.github/workflows/streamlab-ci.yml');
  const guide = read('docs/stream-009-milestone-closure.md');
  const runner = read('scripts/run-stream-009-6.mjs');
  const production = read('deploy/compose.production.yml');
  const migration = read(
    'apps/api/prisma/migrations/20261127100000_analytics_retention_archive/migration.sql',
  );
  return [
    [
      'Milestones 009.1–009.7 evidence scripts are present',
      Array.from({ length: 7 }, (_, i) => `scripts/verify-stream-009-${i + 1}.mjs`).every((file) =>
        existsSync(join(root, file)),
      ),
    ],
    [
      'CI includes quality, security-regression and isolated PostgreSQL jobs',
      ['quality:', 'security-regression:', 'analytics-postgres:', 'postgres:17-alpine'].every(
        (word) => workflow.includes(word),
      ),
    ],
    [
      'Offline regression runner covers critical API, worker and analytics contracts',
      [
        'test:security',
        'test:hardening',
        'test:playback',
        'test:analytics:retention',
        'test:shutdown',
        'test:observability',
      ].every((word) => runner.includes(word)),
    ],
    ['Analytics archive migration is included', migration.includes('VideoAnalyticsArchive')],
    [
      'Production service definitions do not include hosted database or Redis containers',
      !/^ {2}(?:postgres|redis|storage):/mu.test(production) &&
        production.includes('profiles: [migration]'),
    ],
    [
      'Closure documentation retains explicit unverified runtime release gates',
      ['GitHub CI', 'PostgreSQL', 'Docker', 'staging', 'rollback', 'approval'].every((word) =>
        guide.includes(word),
      ),
    ],
    [
      'Closure documentation separates local health timing from load certification',
      guide.includes('40/40') && guide.includes('not a load test'),
    ],
    [
      'No automatic production migration or deployment in closure runner',
      !read('scripts/verify-stream-009-8.mjs').includes('db:migrate:deploy') &&
        !read('scripts/verify-stream-009-8.mjs').includes('docker compose up'),
    ],
  ];
}

export function parseMode(args) {
  const modes = new Set(['--help', '--plan', '--inspect-only', '--offline']);
  if (args.length > 1 || args.some((arg) => !modes.has(arg))) {
    throw new Error(
      'Usage: node scripts/verify-stream-009-8.mjs [--plan|--inspect-only|--offline|--help]',
    );
  }
  return args[0] ?? '--inspect-only';
}

export function offlineGates() {
  const priorTests = Array.from(
    { length: 7 },
    (_, i) => `scripts/tests/verify-stream-009-${i + 1}.test.mjs`,
  );
  return [
    [
      'Closure + prior static verifier unit tests',
      process.execPath,
      [
        '--test',
        'scripts/tests/verify-stream-009-8.test.mjs',
        ...priorTests,
        'scripts/tests/stream-009-6-perf.test.mjs',
        'scripts/tests/production-preflight.test.mjs',
      ],
    ],
    ...Array.from({ length: 7 }, (_, i) => [
      `STREAM-009.${i + 1} static evidence`,
      process.execPath,
      [`scripts/verify-stream-009-${i + 1}.mjs`],
    ]),
    ['Prisma schema validation (not a live migration)', 'pnpm', ['db:validate']],
    ['ESLint', 'pnpm', ['lint']],
    ['TypeScript (including DB typecheck)', 'pnpm', ['typecheck']],
    ['Prettier', 'pnpm', ['format:check']],
    ['Application and packages build', 'pnpm', ['build']],
    [
      'STREAM-009.6 offline security / worker / analytics regression',
      process.execPath,
      ['scripts/run-stream-009-6.mjs', '--offline'],
    ],
  ];
}
