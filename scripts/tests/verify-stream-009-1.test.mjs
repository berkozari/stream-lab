import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  inspectEvidence,
  inspectSampleSecrets,
  hasRepoCi,
  inspectRepo,
} from '../lib/stream-009-1-audit.mjs';

function withTemporaryRepo(fn) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'streamlab-0091-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('audit reports missing evidence grouped by area without reading secrets', () =>
  withTemporaryRepo((root) => {
    const evidence = inspectEvidence(root, { Alpha: ['one.ts'], Beta: ['two.ts'] });
    assert.deepEqual(evidence, [
      { area: 'Alpha', missing: ['one.ts'] },
      { area: 'Beta', missing: ['two.ts'] },
    ]);
  }));

test('audit detects existing evidence without requiring dependencies', () =>
  withTemporaryRepo((root) => {
    writeFileSync(path.join(root, 'one.ts'), 'export const one = 1;');
    assert.deepEqual(inspectEvidence(root, { Alpha: ['one.ts'] }), [
      { area: 'Alpha', missing: [] },
    ]);
  }));

test('populated example secret fields are flagged but values never returned', () => {
  const input = 'AUTH_CSRF_SECRET=non_placeholder_secret\nPLAYBACK_SIGNING_SECRET=abcdefghi\n';
  assert.deepEqual(inspectSampleSecrets(input), ['AUTH_CSRF_SECRET', 'PLAYBACK_SIGNING_SECRET']);
  assert.ok(!JSON.stringify(inspectSampleSecrets(input)).includes('abcdefghi'));
});

test('examples with blank or explicit placeholders are not flagged', () => {
  const input =
    'AUTH_CSRF_SECRET=<generate-locally>\nPLAYBACK_SIGNING_SECRET=\nAUTH_ACCESS_TOKEN_SECRET=CHANGE_ME\n';
  assert.deepEqual(inspectSampleSecrets(input), []);
});

test('CI inventory distinguishes absent and present YAML workflow files', () =>
  withTemporaryRepo((root) => {
    assert.equal(hasRepoCi(root), false);
    const dir = path.join(root, '.github/workflows');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'quality.yml'), 'name: Quality\n');
    assert.equal(hasRepoCi(root), true);
  }));

test('repo inventory never prints or returns configured secret contents', () =>
  withTemporaryRepo((root) => {
    writeFileSync(path.join(root, '.env.example'), 'AUTH_CSRF_SECRET=dummy_concrete_value\n');
    const result = inspectRepo(root);
    assert.deepEqual(result.concreteExampleKeys, ['AUTH_CSRF_SECRET']);
    assert.ok(!JSON.stringify(result).includes('dummy_concrete_value'));
  }));
