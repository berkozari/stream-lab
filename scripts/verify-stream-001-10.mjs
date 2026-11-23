import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
  'scripts/smoke-integration.mjs',
  'scripts/smoke-storage-roundtrip.sh',
  'scripts/integration/http-checks.mjs',
  'scripts/tests/http-checks.test.mjs',
  'docs/development/integration-smoke-tests.md',
  'docs/architecture/stream-001-10-acceptance-checklist.md',
];
for (const file of files) {
  assert.ok(fs.existsSync(path.join(root, file)), `Missing: ${file}`);
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(manifest.name, 'streamlab');
for (const script of ['verify:integration', 'test:integration:smoke', 'smoke:integration']) {
  assert.ok(manifest.scripts?.[script], `Missing root script: ${script}`);
}
assert.ok(manifest.scripts.check?.includes('pnpm verify:integration'));
assert.ok(manifest.scripts.check?.includes('pnpm test:integration:smoke'));
assert.ok(manifest.scripts['smoke:integration'].includes('smoke-integration.mjs'));
for (const script of ['smoke:queue', 'db:smoke', 'db:migrate:status']) {
  assert.ok(manifest.scripts?.[script], `Missing prerequisite: ${script}`);
}
console.log('PASS: STREAM-001.10 smoke files, manifest scripts and prerequisites.');
