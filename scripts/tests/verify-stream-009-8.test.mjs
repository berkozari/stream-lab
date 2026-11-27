import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import {
  auditClosureSources,
  checkTrackedFiles,
  missingRequiredFiles,
  offlineGates,
  parseMode,
} from '../lib/stream-009-8-audit.mjs';

const root = mkdtempSync(join(tmpdir(), 'streamlab-0098-'));
after(() => rmSync(root, { recursive: true, force: true }));
const add = (name, value = '') => {
  const file = join(root, name);
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  writeFileSync(file, value);
};

test('CLI mode parsing defaults to inspect-only and rejects unknown/combined flags', () => {
  assert.equal(parseMode([]), '--inspect-only');
  assert.equal(parseMode(['--plan']), '--plan');
  assert.equal(parseMode(['--offline']), '--offline');
  assert.throws(() => parseMode(['--plan', '--offline']), /Usage/u);
  assert.throws(() => parseMode(['--e2e']), /Usage/u);
});

test('required paths detection identifies missing files', () => {
  add('scripts/present.mjs');
  assert.deepEqual(missingRequiredFiles(root, ['scripts/present.mjs', 'scripts/absent.mjs']), [
    'scripts/absent.mjs',
  ]);
});

test('tracked .env files and generated browser states are blocked', () => {
  const report = checkTrackedFiles([
    'apps/api/.env.production',
    'test-results/test/trace.zip',
    'apps/web/.auth/user.json',
    'apps/api/src/app.ts',
  ]);
  assert.equal(report.blocked.length, 3);
});

test('safe environment examples are not blocked; private keys are flagged', () => {
  const report = checkTrackedFiles(['.env.example', 'deploy/production.env.example', 'server.pem']);
  assert.deepEqual(report.blocked, []);
  assert.deepEqual(report.review, ['server.pem']);
});

test('source audit fails closed when CI, migration and deployment evidence is missing', () => {
  const outcomes = auditClosureSources(root);
  assert.equal(outcomes.length, 8);
  assert.ok(outcomes.some(([, ok]) => !ok));
});

test('offline gates are bounded and exclude destructive commands or production operations', () => {
  const gates = offlineGates();
  assert.equal(gates.length, 14);
  const line = gates.flatMap(([, bin, args]) => [bin, ...args]).join(' ');
  for (const blocked of [
    'db:migrate:deploy',
    'docker compose up',
    'smoke:analytics:retention',
    'run-stream-008-8.mjs',
    '--full',
  ]) {
    assert.ok(!line.includes(blocked), `unexpected unsafe execution: ${blocked}`);
  }
});

test('offline gates require all seven previous static source verifiers', () => {
  const gates = offlineGates();
  for (let index = 1; index <= 7; index += 1) {
    assert.ok(gates.some(([, , args]) => args.includes(`scripts/verify-stream-009-${index}.mjs`)));
  }
});

test('--plan lists commands without contacting Git or running pnpm', () => {
  const script = fileURLToPath(new URL('../verify-stream-009-8.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--plan'], {
    encoding: 'utf8',
    cwd: root,
    env: { PATH: '/no-tools', HOME: root },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No operations executed/u);
  assert.match(result.stdout, /Gate 14:/u);
});

test('unsupported mode rejects without running anything', () => {
  const script = fileURLToPath(new URL('../verify-stream-009-8.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--deploy'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/u);
});
