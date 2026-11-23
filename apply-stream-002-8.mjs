import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = process.cwd();
const payloadDir = resolve(root, 'stream-002-8-payload');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const targetFiles = [
  'apps/api/tests/unit/auth-security-hardening.test.ts',
  'apps/api/tests/integration/auth-security.http.test.ts',
  'apps/api/scripts/auth-security-smoke.ts',
  'scripts/verify-stream-002-8.mjs',
];

function withScript(scripts, key, value) {
  if (Object.hasOwn(scripts, key) && scripts[key] !== value) {
    throw new Error(`Conflicting script ${key}: refusing to overwrite local changes`);
  }
  scripts[key] = value;
}

try {
  assert.ok(existsSync(payloadDir), 'Missing stream-002-8-payload folder. Unzip full patch first.');
  const rootPkg = JSON.parse(read('package.json'));
  const apiPkg = JSON.parse(read('apps/api/package.json'));
  assert.ok(typeof rootPkg.scripts?.check === 'string', 'Root check script missing');
  assert.ok(
    typeof apiPkg.scripts?.['test:session'] === 'string',
    'STREAM-002.5 API scripts missing',
  );
  assert.ok(
    rootPkg.scripts.check.includes('pnpm test:web:auth:ui'),
    'STREAM-002.7 must be installed first',
  );

  const newRoot = structuredClone(rootPkg);
  const newApi = structuredClone(apiPkg);
  withScript(newRoot.scripts, 'verify:auth:security', 'node scripts/verify-stream-002-8.mjs');
  withScript(
    newRoot.scripts,
    'test:auth:security',
    'pnpm --filter @streamlab/contracts build && pnpm --filter @streamlab/api test:security',
  );
  withScript(newRoot.scripts, 'smoke:auth:security', 'pnpm --filter @streamlab/api smoke:security');
  withScript(
    newApi.scripts,
    'test:security',
    'node --import tsx --test tests/unit/auth-security-hardening.test.ts tests/integration/auth-security.http.test.ts',
  );
  withScript(newApi.scripts, 'smoke:security', 'tsx scripts/auth-security-smoke.ts');

  const suffix = 'pnpm verify:auth:security && pnpm test:auth:security';
  if (!newRoot.scripts.check.includes('pnpm verify:auth:security')) {
    newRoot.scripts.check += ` && ${suffix}`;
  } else if (!newRoot.scripts.check.includes('pnpm test:auth:security')) {
    throw new Error('Root check includes partial security commands: refusing to guess');
  }

  const changes = new Map();
  const rootText = `${JSON.stringify(newRoot, null, 2)}\n`;
  const apiText = `${JSON.stringify(newApi, null, 2)}\n`;
  if (read('package.json') !== rootText) changes.set(resolve(root, 'package.json'), rootText);
  if (read('apps/api/package.json') !== apiText)
    changes.set(resolve(root, 'apps/api/package.json'), apiText);

  for (const name of targetFiles) {
    const source = resolve(payloadDir, name);
    assert.ok(existsSync(source), `Missing payload file ${name}`);
    const content = readFileSync(source, 'utf8');
    const destination = resolve(root, name);
    if (existsSync(destination)) {
      assert.equal(
        readFileSync(destination, 'utf8'),
        content,
        `Existing ${name} differs. Refusing overwrite.`,
      );
    } else {
      changes.set(destination, content);
    }
  }

  // No project files have been written before all conflicts are checked.
  for (const [destination, contents] of changes) {
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, contents, { flag: 'w' });
  }
  console.log(`PASS: STREAM-002.8 installed safely (${changes.size} files created/updated).`);
  if (changes.size === 0) console.log('Already installed; no changes made.');
} catch (error) {
  console.error('FAIL: STREAM-002.8 installer aborted before applying project changes.');
  throw error;
}
