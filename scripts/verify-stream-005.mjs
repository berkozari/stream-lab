import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * STREAM-005 offline regression gate. No migrations, Redis mutations, S3 writes,
 * or background services. Live tests and E2E are documented separately.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const steps = [
  ['Contracts', ['--filter', '@streamlab/contracts', 'test']],
  ['API queue', ['--filter', '@streamlab/api', 'test:transcoding:queue']],
  ['API outbox', ['--filter', '@streamlab/api', 'test:transcoding:outbox']],
  [
    'API dispatch & upload integration',
    ['--filter', '@streamlab/api', 'test:transcoding:integration'],
  ],
  ['API recovery', ['--filter', '@streamlab/api', 'test:transcoding:recovery']],
  ['Upload complete regression', ['--filter', '@streamlab/api', 'test:upload:complete']],
  ['Upload multipart regression', ['--filter', '@streamlab/api', 'test:upload:multipart']],
  ['Worker foundation', ['--filter', '@streamlab/worker', 'test:foundation']],
  ['Worker lifecycle', ['--filter', '@streamlab/worker', 'test:lifecycle']],
  ['Worker FFprobe & storage', ['--filter', '@streamlab/worker', 'test:probe']],
  ['Worker HLS', ['--filter', '@streamlab/worker', 'test:hls']],
  ['Worker cleanup', ['--filter', '@streamlab/worker', 'test:cleanup']],
  ['Worker shutdown', ['--filter', '@streamlab/worker', 'test:shutdown']],
  ['Real FFmpeg integration', ['--filter', '@streamlab/worker', 'test:hls:integration']],
  ['Workspace lint', ['lint']],
  ['Workspace typecheck', ['typecheck']],
  ['Workspace build', ['build']],
  ['Workspace format check', ['format:check']],
];

const failed = [];
for (const [label, args] of steps) {
  console.log(`\n[STREAM-005] Running ${label}...`);
  const result = spawnSync('pnpm', args, { cwd: root, env: process.env, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    failed.push(label);
    console.error(`[STREAM-005] FAIL: ${label}${result.error ? ` (${result.error.message})` : ''}`);
  } else {
    console.log(`[STREAM-005] PASS: ${label}`);
  }
}
console.log(`\n[STREAM-005] ${steps.length - failed.length}/${steps.length} gates passed`);
if (failed.length) {
  console.error(`[STREAM-005] Failed gates: ${failed.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(
    '[STREAM-005] Offline regression PASS. Live DB/Redis and E2E checks are separate gates.',
  );
}
