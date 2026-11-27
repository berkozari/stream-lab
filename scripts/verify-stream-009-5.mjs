import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = (name) => readFileSync(resolve(root, name), 'utf8');
const checks = [
  [
    'Server-generated request IDs precede HTTP logs',
    () => {
      const app = file('apps/api/src/app.ts');
      return (
        app.indexOf('app.use(requestIdMiddleware);') <
          app.indexOf('app.use(requestLoggerMiddleware);') &&
        file('apps/api/src/middlewares/request-logger.middleware.ts').includes('genReqId:')
      );
    },
  ],
  [
    'Sensitive URL query strings remain excluded',
    () => file('apps/api/src/middlewares/request-logger.middleware.ts').includes("split('?')[0]"),
  ],
  [
    'Worker logs are structured and redact credential fields',
    () => {
      const logger = file('apps/worker/src/lib/logger.ts');
      return (
        logger.includes("import pino from 'pino'") &&
        logger.includes('redact:') &&
        logger.includes('passwordHash') &&
        logger.includes('playbackToken')
      );
    },
  ],
  [
    'Worker events never include raw job data or error messages',
    () => {
      const worker = file('apps/worker/src/jobs/video-processing.worker.ts');
      return (
        worker.includes("event: 'job_completed'") &&
        worker.includes("event: 'job_failed'") &&
        !worker.includes('error.message') &&
        !worker.includes('job.data')
      );
    },
  ],
  [
    'Bounded, read-only BullMQ counters',
    () => {
      const metrics = file('apps/worker/src/observability/queue-metrics.ts');
      return (
        metrics.includes('getJobCounts(') &&
        metrics.includes("'waiting'") &&
        metrics.includes("'delayed'") &&
        !metrics.includes('getJobs(')
      );
    },
  ],
  [
    'Poller serializes work and has stop/cleanup',
    () => {
      const metrics = file('apps/worker/src/observability/queue-metrics.ts');
      const worker = file('apps/worker/src/jobs/video-processing.worker.ts');
      return (
        metrics.includes('inFlight =') &&
        metrics.includes('stopped = true') &&
        worker.includes('await stopMetrics();') &&
        worker.includes('await metricsQueue.close();')
      );
    },
  ],
  [
    'Worker Pino dependency and frozen lockfile stay in sync',
    () => {
      const pkg = JSON.parse(file('apps/worker/package.json'));
      const lock = file('pnpm-lock.yaml');
      const importer = lock.split('  apps/worker:')[1]?.split('  packages/contracts:')[0] ?? '';
      return Boolean(pkg.dependencies.pino) && importer.includes('      pino:');
    },
  ],
  [
    'Operator docs and regression tests are included',
    () =>
      file('docs/stream-009.5-logging-metrics-monitoring.md').includes('global') &&
      file('apps/worker/tests/unit/queue-metrics.test.ts').includes('stops polling') &&
      file('apps/api/tests/integration/observability.http.test.ts').includes('correlation ID'),
  ],
];

export function verify() {
  let pass = 0;
  for (const [title, check] of checks) {
    const ok = check();
    console.log(`[STREAM-009.5] ${ok ? 'PASS' : 'FAIL'}: ${title}`);
    if (ok) pass += 1;
  }
  console.log(
    `[STREAM-009.5] ${pass}/${checks.length} static source groups passed (not runtime certification).`,
  );
  return pass === checks.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!verify()) process.exitCode = 1;
}
