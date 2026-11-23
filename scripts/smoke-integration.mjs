import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { checkApiHttp, checkWebHttp } from './integration/http-checks.mjs';

const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000';
const webBase = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:5173';

function command(label, executable, args, env = {}) {
  console.info(`\n=== ${label} ===`);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
    child.once('error', (error) =>
      reject(new Error(`${label}: unable to start`, { cause: error })),
    );
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(new Error(`${label} failed (exit=${code ?? 'null'}, signal=${signal ?? 'none'})`));
    });
  });
}

async function main() {
  if (!existsSync('.env')) {
    throw new Error('Root .env missing. Copy .env.example to .env and set local values.');
  }
  console.info('STREAM-001.10 — Integration Smoke Tests');
  console.info('Prerequisites: Docker services and pnpm dev (Web, API, Worker) are running.');
  console.info(`Web: ${webBase}\nAPI: ${apiBase}`);

  await command('1/7 Docker infrastructure, private buckets and CORS', 'bash', [
    'scripts/smoke-infra.sh',
  ]);
  await command('2/7 Prisma migration status', 'pnpm', ['db:migrate:status']);
  await command('3/7 Prisma database and seed smoke', 'pnpm', ['db:smoke']);
  await command('4/7 S3-compatible storage write/read/cleanup', 'bash', [
    'scripts/smoke-storage-roundtrip.sh',
  ]);

  console.info('\n=== 5/7 API and Web HTTP checks ===');
  await checkApiHttp({ apiBase, webBase });
  await checkWebHttp({ webBase });

  await command('6/7 API -> BullMQ -> Worker (normal job)', 'pnpm', ['smoke:queue'], {
    QUEUE_SMOKE_RETRY: '0',
  });
  await command('7/7 API -> BullMQ -> Worker (retry job)', 'pnpm', ['smoke:queue'], {
    QUEUE_SMOKE_RETRY: '1',
  });
  console.info('\nPASS: STREAM-001.10 integrated infrastructure checks completed.');
  console.info('Manual browser check remains: actual React rendering and mobile layout.');
}

main().catch((error) => {
  console.error('\nFAIL: STREAM-001.10 integration smoke:', error);
  process.exitCode = 1;
});
