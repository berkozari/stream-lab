import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const checks = [
  [
    'Secret-safe build context',
    () => {
      const ignore = read('.dockerignore');
      return (
        ignore.includes('**/.env.*') &&
        ignore.includes('.git') &&
        ignore.includes('**/node_modules')
      );
    },
  ],
  [
    'Dedicated API/worker/migration/web image targets',
    () => {
      const dockerfile = read('deploy/Dockerfile');
      return [
        'AS api',
        'AS worker',
        'AS migrate',
        'AS web',
        'pnpm db:generate',
        'USER node',
        'ffmpeg',
      ].every((token) => dockerfile.includes(token));
    },
  ],
  [
    'Production Compose uses external dependencies and loopback binds',
    () => {
      const compose = read('deploy/compose.production.yml');
      return (
        !/\n {2}(postgres|redis|storage):/u.test(compose) &&
        compose.includes("'127.0.0.1:${STREAMLAB_API_BIND_PORT:-4000}:4000'") &&
        compose.includes("'127.0.0.1:${STREAMLAB_WEB_BIND_PORT:-8080}:8080'") &&
        compose.includes('restart: unless-stopped')
      );
    },
  ],
  [
    'Dedicated migration job requires explicit profile',
    () => {
      const compose = read('deploy/compose.production.yml');
      return (
        compose.includes('profiles: [migration]') &&
        compose.includes('target: migrate') &&
        compose.includes("restart: 'no'")
      );
    },
  ],
  [
    'Readiness uses dependency-sensitive endpoint',
    () => {
      const check = read('scripts/production/healthcheck.mjs');
      return check.includes('/api/v1/health/ready') && check.includes('result.status !== 200');
    },
  ],
  [
    'Production preflight fail-closed and redacted',
    () => {
      const preflight = read('scripts/production/preflight.mjs');
      return (
        preflight.includes('NODE_ENV') &&
        preflight.includes('RATE_LIMIT_STORE') &&
        preflight.includes("url.protocol === 'rediss:'") &&
        preflight.includes('INDEPENDENT_SECRETS') &&
        preflight.includes('process.exitCode = 1') &&
        !preflight.includes('JSON.stringify(process.env)')
      );
    },
  ],
  [
    'Read-only backup protects dump and checks its format',
    () => {
      const backup = read('scripts/production/postgres-backup.sh');
      return (
        backup.includes('umask 077') &&
        backup.includes('pg_dump --format=custom') &&
        backup.includes('pg_restore --list') &&
        backup.includes('PGDATABASE="$DATABASE_URL"') &&
        !backup.includes('pg_restore --clean')
      );
    },
  ],
  [
    'Documentation explains gate limits and recovery',
    () => {
      const docs = read('docs/stream-009.7-production-readiness.md');
      return ['restore', 'rollback', 'backup', 'CI', 'TLS', '009.4'].every((token) =>
        docs.includes(token),
      );
    },
  ],
];

let failures = 0;
for (const [name, check] of checks) {
  try {
    if (!check()) throw new Error('check returned false');
    console.log(`[STREAM-009.7] PASS: ${name}`);
  } catch {
    failures++;
    console.error(`[STREAM-009.7] FAIL: ${name}`);
  }
}
console.log(
  `[STREAM-009.7] ${checks.length - failures}/${checks.length} static checks${failures ? ' FAILED' : ' PASS'}. Not runtime certification.`,
);
if (failures) process.exitCode = 1;
