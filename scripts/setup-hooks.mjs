import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ZIP extraction can happen before `git init`; do not fail dependency installation.
if (!existsSync(join(root, '.git'))) {
  console.log('[hooks] Git repository not initialized; skipping Husky.');
  console.log('[hooks] After git init, run: pnpm setup:hooks');
  process.exit(0);
}

if (process.env.HUSKY === '0') {
  console.log('[hooks] Skipped because HUSKY=0.');
  process.exit(0);
}

const command = process.platform === 'win32' ? 'husky.cmd' : 'husky';
const result = spawnSync(command, [], { cwd: root, stdio: 'inherit' });
if (result.error) {
  console.error('[hooks] Could not initialize Husky:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
