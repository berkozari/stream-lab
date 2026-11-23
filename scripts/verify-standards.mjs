import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'eslint.config.mjs',
  '.prettierrc.json',
  '.prettierignore',
  '.lintstagedrc.json',
  '.husky/pre-commit',
  '.gitattributes',
  'docs/development/code-standards.md',
  'docs/architecture/stream-001-3-acceptance-checklist.md',
];
for (const path of required) {
  assert.ok(existsSync(join(root, path)), `Missing: ${path}`);
}
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const scripts = ['lint', 'lint:fix', 'format', 'format:check', 'check', 'prepare', 'setup:hooks'];
for (const script of scripts) assert.ok(rootPackage.scripts[script], `Missing script: ${script}`);
const deps = [
  'eslint',
  'typescript-eslint',
  'prettier',
  'eslint-plugin-react-hooks',
  'lint-staged',
  'husky',
];
for (const dependency of deps) {
  assert.ok(rootPackage.devDependencies[dependency], `Missing dependency: ${dependency}`);
}
const tsconfig = JSON.parse(readFileSync(join(root, 'tsconfig.base.json'), 'utf8'));
for (const option of [
  'strict',
  'noUncheckedIndexedAccess',
  'noUnusedLocals',
  'noUnusedParameters',
  'noImplicitOverride',
]) {
  assert.equal(tsconfig.compilerOptions[option], true, `Missing tsconfig flag: ${option}`);
}
JSON.parse(readFileSync(join(root, '.prettierrc.json'), 'utf8'));
JSON.parse(readFileSync(join(root, '.lintstagedrc.json'), 'utf8'));
assert.match(
  readFileSync(join(root, 'eslint.config.mjs'), 'utf8'),
  /reactHooks\.configs\.flat\.recommended/,
);
console.log('PASS: STREAM-001.3 files, scripts, TS flags and configuration manifests are present.');
console.log('NOTE: ESLint/Prettier execution requires pnpm install.');
