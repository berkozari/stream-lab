import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const videoId = process.env.STREAMLAB_E2E_PLAYBACK_VIDEO_ID;
const abrId = process.env.STREAMLAB_E2E_PLAYBACK_ABR_VIDEO_ID;
if (!videoId || !uuidPattern.test(videoId)) {
  process.stderr.write(
    'ERROR: Set STREAMLAB_E2E_PLAYBACK_VIDEO_ID to an existing READY video UUID. No tests run.\n',
  );
  process.exit(2);
}
if (abrId && !uuidPattern.test(abrId)) {
  process.stderr.write('ERROR: STREAMLAB_E2E_PLAYBACK_ABR_VIDEO_ID must be a UUID.\n');
  process.exit(2);
}
const result = spawnSync(
  'pnpm',
  [
    'exec',
    'playwright',
    'test',
    'apps/web/tests/e2e/playback-flow.spec.ts',
    '--config=playwright.config.ts',
  ],
  { cwd: root, stdio: 'inherit' },
);
if (result.error) {
  process.stderr.write(`Playwright launch failed: ${result.error.message}\n`);
}
process.exit(result.status ?? 1);
