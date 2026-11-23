import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
for (const path of [
  'apps/web/src/features/auth/utils/auth-form.utils.ts',
  'apps/web/src/features/auth/utils/auth-navigation.utils.ts',
  'apps/web/src/features/auth/components/AuthForm.tsx',
  'apps/web/src/features/auth/components/ProtectedRoute.tsx',
  'apps/web/tests/auth-ui.test.ts',
]) {
  assert.ok(existsSync(path), `Missing ${path}`);
}
const form = read('apps/web/src/features/auth/components/AuthForm.tsx');
assert.match(form, /validateAuthFields/);
assert.match(form, /authPageLink/);
assert.match(form, /aria-describedby/);
assert.match(form, /aria-invalid/);
assert.match(form, /aria-busy/);
assert.match(form, /noValidate/);
assert.match(form, /showPassword/);
const authUtils = read('apps/web/src/features/auth/utils/auth-form.utils.ts');
assert.match(authUtils, /LoginRequestSchema/);
assert.match(authUtils, /RegisterRequestSchema/);
const routes = read('apps/web/src/features/auth/components/ProtectedRoute.tsx');
assert.match(routes, /protectedLoginLink/);
assert.match(routes, /retryBootstrapAuth/);
assert.match(read('apps/web/src/features/auth/services/auth-state.ts'), /memory-only/);
const root = JSON.parse(read('package.json'));
const web = JSON.parse(read('apps/web/package.json'));
assert.ok(root.scripts.check.includes('pnpm verify:web:auth:ui'));
assert.ok(root.scripts.check.includes('pnpm test:web:auth:ui'));
assert.ok(root.scripts['test:web:auth:ui'].includes('contracts build'));
assert.ok(web.scripts['test:auth:ui'].includes('tests/auth-ui.test.ts'));
console.log('PASS: STREAM-002.7 form UX, shared schemas, redirect guard, test scripts');
