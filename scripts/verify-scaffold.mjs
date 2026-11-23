import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const expected = [
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'apps/web/package.json',
  'apps/web/src/App.tsx',
  'apps/web/src/main.tsx',
  'apps/api/package.json',
  'apps/api/src/app.ts',
  'apps/api/src/index.ts',
  'apps/api/src/routes/health.routes.ts',
  'apps/worker/package.json',
  'apps/worker/src/index.ts',
  'packages/contracts/package.json',
  'packages/contracts/src/index.ts',
  'docs/adr/ADR-001-monorepo-and-runtime-boundaries.md',
];
for (const path of expected) assert.ok(existsSync(join(root, path)), `Missing: ${path}`);

const packages = [
  ['apps/web', '@streamlab/web'],
  ['apps/api', '@streamlab/api'],
  ['apps/worker', '@streamlab/worker'],
  ['packages/contracts', '@streamlab/contracts'],
];
for (const [path, name] of packages) {
  assert.equal(readJson(`${path}/package.json`).name, name);
  readJson(`${path}/tsconfig.json`);
}
assert.equal(readJson('apps/api/package.json').dependencies['@streamlab/contracts'], 'workspace:*');
assert.equal(readJson('apps/web/package.json').dependencies['@streamlab/contracts'], 'workspace:*');
assert.ok(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8').includes('apps/*'));
assert.ok(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8').includes('packages/*'));
console.log('PASS: 4 workspace packages, configs, source skeleton and ADR files are present.');
console.log('NOTE: dependency install and build require package registry access; not tested here.');
