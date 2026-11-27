#!/usr/bin/env node
/** Static source evidence, not a CI or live service certification. */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function audit(root = defaultRoot) {
  const file = (path) => {
    try {
      return readFileSync(resolve(root, path), 'utf8');
    } catch {
      return '';
    }
  };
  const workflow = file('.github/workflows/streamlab-ci.yml');
  const runner = file('scripts/run-stream-009-6.mjs');
  const probe = file('scripts/lib/stream-009-6-perf.mjs');
  const cli = file('scripts/perf/health-probe.mjs');
  const tests = file('scripts/tests/stream-009-6-perf.test.mjs');
  const boundary = file('apps/api/tests/integration/security-boundaries.http.test.ts');
  const doc = file('docs/stream-009.6-security-performance-testing.md');
  return [
    [
      'CI uses limited events, least permissions and no privileged PR trigger',
      workflow.includes('pull_request:') &&
        workflow.includes('contents: read') &&
        workflow.includes('persist-credentials: false') &&
        !workflow.includes('pull_request_target:'),
    ],
    [
      'CI uses Node 24, pnpm 10 and frozen lockfile',
      workflow.includes("node-version: '24'") &&
        workflow.includes('version: 10.34.9') &&
        workflow.includes('pnpm install --frozen-lockfile'),
    ],
    [
      'CI exercises quality, offline regressions and a separate disposable PostgreSQL job',
      [
        'quality:',
        'security-regression:',
        'analytics-postgres:',
        'postgres:17-alpine',
        'db:migrate:deploy',
        'ANALYTICS_INTEGRATION_ACK: disposable-database',
        'smoke:analytics:retention',
      ].every((entry) => workflow.includes(entry)),
    ],
    [
      'Regression runner covers auth, Redis, HLS, worker, analytics and observability',
      [
        'test:security',
        'test:hardening',
        'test:playback',
        'test:analytics:retention',
        'security-boundaries.http.test.ts',
        'test:observability',
        'test:shutdown',
      ].every((entry) => runner.includes(entry)),
    ],
    [
      'Local probe uses GET only, never redirects and strictly caps load',
      probe.includes("method: 'GET'") &&
        probe.includes("redirect: 'manual'") &&
        probe.includes('200') &&
        probe.includes('concurrency > 8') &&
        probe.includes('requests > 200'),
    ],
    [
      'Probe refuses remote/write/auth endpoints and secrets',
      probe.includes("new Set(['127.0.0.1', 'localhost', '[::1]'])") &&
        probe.includes("url.pathname !== '/api/v1/health'") &&
        probe.includes('url.username') &&
        cli.includes('--help'),
    ],
    [
      'Boundaries and sampler have behavioral tests',
      boundary.includes('PAYLOAD_TOO_LARGE') &&
        boundary.includes('CORS_ORIGIN_DENIED') &&
        tests.includes('real HTTP fixture') &&
        tests.includes('concurrency'),
    ],
    [
      'Operator guide distinguishes CI fixtures from performance/load and production validation',
      doc.includes('PostgreSQL') &&
        doc.includes('Redis') &&
        doc.includes('p95') &&
        doc.includes('production') &&
        doc.includes('rollback'),
    ],
  ];
}

export function verify(root = defaultRoot) {
  const results = audit(root);
  let passed = 0;
  for (const [name, ok] of results) {
    console.log(`[STREAM-009.6] ${ok ? 'PASS' : 'FAIL'}: ${name}`);
    if (ok) passed += 1;
  }
  console.log(
    `[STREAM-009.6] ${passed}/${results.length} static source groups passed (not CI/runtime certification).`,
  );
  return passed === results.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!verify()) process.exitCode = 1;
}
