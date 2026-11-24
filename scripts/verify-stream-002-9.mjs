import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = JSON.parse(readFileSync('package.json', 'utf8'));
const required = [
  'playwright.config.ts',
  'apps/web/tests/e2e/auth-flow.spec.ts',
  'apps/api/scripts/auth-e2e-cleanup.ts',
];
for (const file of required) assert.ok(existsSync(file), `Missing E2E file: ${file}`);

assert.ok(root.devDependencies['@playwright/test'], 'Missing @playwright/test dependency');
assert.equal(root.scripts['verify:auth:e2e'], 'node scripts/verify-stream-002-9.mjs');
assert.equal(
  root.scripts['test:auth:e2e'],
  'playwright test apps/web/tests/e2e/auth-flow.spec.ts --config=playwright.config.ts',
);
assert.ok(root.scripts.check.includes('pnpm verify:auth:e2e'));
assert.ok(!root.scripts.check.includes('pnpm test:auth:e2e'), 'Browser E2E needs separate infra');

const config = readFileSync('playwright.config.ts', 'utf8');
assert.match(config, /webServer/u);
assert.match(config, /127\.0\.0\.1:5173/u);
assert.match(config, /127\.0\.0\.1:4000/u);
const spec = readFileSync('apps/web/tests/e2e/auth-flow.spec.ts', 'utf8');
assert.match(spec, /getByRole/u);
assert.match(spec, /logout revokes only the current browser session/u);
const cleanup = readFileSync('apps/api/scripts/auth-e2e-cleanup.ts', 'utf8');
assert.match(cleanup, /streamlab-e2e-/u);
assert.match(cleanup, /\.invalid/u);
assert.match(cleanup, /consumedRefreshToken\.deleteMany/u);
console.log('PASS: STREAM-002.9 Playwright E2E integration, isolated cleanup, and scripts');
