import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Run from repository root AFTER extracting the patch with `unzip -n`.
const root = process.cwd();
for (const relative of [
  'pnpm-workspace.yaml',
  'apps/api/package.json',
  'apps/api/prisma/schema.prisma',
]) {
  assert.ok(existsSync(join(root, relative)), `Missing ${relative}; run this from StreamLab root.`);
}

function updateJson(relative, update) {
  const file = join(root, relative);
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  update(manifest);
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

updateJson('apps/api/package.json', (pkg) => {
  assert.equal(pkg.name, '@streamlab/api', 'Unexpected API package name');
  pkg.dependencies = {
    ...pkg.dependencies,
    '@prisma/adapter-pg': '7.10.1',
    '@prisma/client': '7.10.1',
    dotenv: '^17.2.3',
  };
  pkg.devDependencies = { ...pkg.devDependencies, prisma: '7.10.1' };
  pkg.scripts = {
    ...pkg.scripts,
    'db:validate': 'prisma validate',
    'db:generate': 'prisma generate',
    'db:migrate:dev': 'prisma migrate dev',
    'db:migrate:status': 'prisma migrate status',
    'db:migrate:deploy': 'prisma migrate deploy',
    'db:seed': 'prisma db seed',
    'db:smoke': 'tsx scripts/db-smoke.ts',
    'db:typecheck': 'tsc --noEmit -p tsconfig.db.json',
  };
});

updateJson('package.json', (pkg) => {
  assert.equal(pkg.name, 'streamlab', 'Unexpected monorepo root name');
  pkg.scripts = {
    ...pkg.scripts,
    build: 'pnpm db:generate && pnpm -r --if-present build',
    typecheck:
      'pnpm db:generate && pnpm --filter @streamlab/contracts build && pnpm -r --if-present typecheck && pnpm --filter @streamlab/api db:typecheck',
    'db:validate': 'pnpm --filter @streamlab/api db:validate',
    'db:generate': 'pnpm --filter @streamlab/api db:generate',
    'db:migrate:dev': 'pnpm --filter @streamlab/api db:migrate:dev',
    'db:migrate:status': 'pnpm --filter @streamlab/api db:migrate:status',
    'db:migrate:deploy': 'pnpm --filter @streamlab/api db:migrate:deploy',
    'db:seed': 'pnpm --filter @streamlab/api db:seed',
    'db:smoke': 'pnpm --filter @streamlab/api db:smoke',
  };
});

const ignoreFile = join(root, '.gitignore');
const ignore = readFileSync(ignoreFile, 'utf8');
if (!ignore.includes('apps/api/src/generated/')) {
  writeFileSync(
    ignoreFile,
    `${ignore.trimEnd()}\n\n# Generated Prisma Client (recreate with pnpm db:generate)\napps/api/src/generated/\n`,
  );
}

console.log('PASS: merged package.json scripts/dependencies without replacing other entries.');
console.log('Next: pnpm install && pnpm db:validate && pnpm db:migrate:dev --name init_streamlab');
