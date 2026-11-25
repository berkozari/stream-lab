import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const gates = [
  ['Build shared contracts', ['--filter', '@streamlab/contracts', 'build']],
  ['Playback API unit + HTTP tests', ['--filter', '@streamlab/api', 'test:playback']],
  [
    'HLS security header integration',
    [
      '--filter',
      '@streamlab/api',
      'exec',
      'node',
      '--import',
      'tsx',
      '--test',
      'tests/integration/playback-security-headers.http.test.ts',
    ],
  ],
  ['Playback frontend tests', ['--filter', '@streamlab/web', 'test:playback']],
  ['Video read regression', ['--filter', '@streamlab/api', 'test:video:read']],
  ['Video query regression', ['--filter', '@streamlab/web', 'test:video:client']],
  ['Upload frontend regression', ['--filter', '@streamlab/web', 'test:upload:ui']],
  ['Workspace typecheck', ['typecheck']],
  ['Workspace lint', ['lint']],
  ['Workspace format check', ['format:check']],
  ['Frontend production build', ['--filter', '@streamlab/web', 'build']],
];

const failures = [];
for (const [name, args] of gates) {
  process.stdout.write(`\n[STREAM-006.7] ${name}\n`);
  const result = spawnSync('pnpm', args, {
    cwd: root,
    stdio: 'inherit',
    timeout: 240_000,
  });
  if (result.status !== 0) {
    failures.push(name);
    process.stderr.write(
      `[STREAM-006.7] FAIL: ${name} (${result.error?.message ?? result.status ?? 'unknown'})\n`,
    );
  }
}

process.stdout.write(
  `\n[STREAM-006.7] ${gates.length - failures.length}/${gates.length} offline gates passed\n`,
);
if (failures.length) {
  process.stderr.write(`[STREAM-006.7] Failed: ${failures.join('; ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    '[STREAM-006.7] Offline regression PASS. Live Playwright tests are separate.\n',
  );
}
