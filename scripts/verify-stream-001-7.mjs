import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), 'utf8'));
const files = [
  'apps/web/src/App.tsx',
  'apps/web/src/main.tsx',
  'apps/web/src/app/providers/AppProviders.tsx',
  'apps/web/src/app/providers/QueryProvider.tsx',
  'apps/web/src/app/router/index.tsx',
  'apps/web/src/layout/MainLayout.tsx',
  'apps/web/src/layout/DashboardLayout.tsx',
  'apps/web/src/components/layout/Header.tsx',
  'apps/web/src/components/layout/Sidebar.tsx',
  'apps/web/src/components/shared/AppErrorBoundary.tsx',
  'apps/web/src/features/health/hooks/useHealth.ts',
  'apps/web/src/features/health/services/health.service.ts',
  'apps/web/src/pages/home/HomePage.tsx',
  'apps/web/src/pages/creator/CreatorDashboardPage.tsx',
  'apps/web/src/pages/videos/VideoDetailPage.tsx',
  'apps/web/src/pages/errors/NotFoundPage.tsx',
  'apps/web/src/lib/axios.ts',
  'apps/web/src/lib/query-client.ts',
  'apps/web/src/lib/utils.ts',
  'apps/web/src/services/api/api-client.ts',
  'apps/web/src/index.css',
  'apps/web/src/styles/tokens.css',
  'apps/web/src/styles/themes.css',
  'apps/web/src/styles/globals.css',
  'apps/web/components.json',
];
for (const file of files) assert.ok(existsSync(resolve(root, file)), `Missing: ${file}`);
const pkg = readJson('apps/web/package.json');
const deps = [
  'react-router',
  '@tanstack/react-query',
  'axios',
  'lucide-react',
  'clsx',
  'tailwind-merge',
];
const devDeps = ['tailwindcss', '@tailwindcss/vite', '@types/node'];
for (const name of deps)
  assert.ok(pkg.dependencies?.[name], `Missing apps/web dependency: ${name}`);
for (const name of devDeps)
  assert.ok(pkg.devDependencies?.[name], `Missing apps/web devDependency: ${name}`);
const rootPkg = readJson('package.json');
assert.equal(rootPkg.scripts?.['verify:web:foundation'], 'node scripts/verify-stream-001-7.mjs');
const cfg = readJson('apps/web/tsconfig.json');
assert.equal(cfg.compilerOptions?.paths?.['@/*']?.[0], './src/*');
const vite = readFileSync(resolve(root, 'apps/web/vite.config.ts'), 'utf8');
assert.ok(vite.includes('@tailwindcss/vite'), 'Missing Tailwind Vite plugin');
assert.ok(vite.includes("'/api'"), 'Missing Vite /api proxy');
const ui = readJson('apps/web/components.json');
assert.equal(ui.aliases.ui, '@/components/ui');
console.log('PASS: STREAM-001.7 files, dependencies, scripts and shadcn aliases');
