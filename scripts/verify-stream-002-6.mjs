import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const newFiles = [
  'apps/web/src/features/auth/services/auth-state.ts',
  'apps/web/src/features/auth/services/auth.service.ts',
  'apps/web/src/features/auth/services/auth-interceptors.ts',
  'apps/web/src/features/auth/hooks/useAuth.ts',
  'apps/web/src/features/auth/hooks/useAuthMutations.ts',
  'apps/web/src/features/auth/hooks/useCurrentUser.ts',
  'apps/web/src/features/auth/components/AuthBootstrap.tsx',
  'apps/web/src/features/auth/components/ProtectedRoute.tsx',
  'apps/web/src/features/auth/components/AuthForm.tsx',
  'apps/web/src/features/auth/components/AuthHeaderActions.tsx',
  'apps/web/src/features/auth/utils/auth.utils.ts',
  'apps/web/src/pages/auth/LoginPage.tsx',
  'apps/web/src/pages/auth/RegisterPage.tsx',
  'apps/web/tests/auth-state.test.ts',
  'apps/web/tests/auth-utils.test.ts',
];
for (const file of newFiles) assert.ok(existsSync(resolve(root, file)), `Missing ${file}`);
const read = (path) => readFileSync(resolve(root, path), 'utf8');
assert.match(read('apps/web/src/app/router/index.tsx'), /ProtectedRoute/);
assert.match(read('apps/web/src/app/providers/AppProviders.tsx'), /AuthBootstrap/);
assert.match(read('apps/web/src/components/layout/Header.tsx'), /AuthHeaderActions/);
assert.match(read('apps/web/src/features/auth/services/auth-interceptors.ts'), /_streamlabRetried/);
assert.doesNotMatch(
  read('apps/web/src/features/auth/services/auth-state.ts'),
  /localStorage|sessionStorage/,
);
const rootPkg = JSON.parse(read('package.json'));
const webPkg = JSON.parse(read('apps/web/package.json'));
assert.ok(rootPkg.scripts.check.includes('pnpm test:web:auth'));
assert.equal(
  webPkg.scripts['test:auth'],
  'node --experimental-strip-types --test tests/auth-state.test.ts tests/auth-utils.test.ts',
);
console.log('PASS: STREAM-002.6 client auth structure, route guard, memory token, test scripts');
