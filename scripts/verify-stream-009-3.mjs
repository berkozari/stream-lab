import { resolve } from 'node:path';
import { auditWorkerHardening } from './lib/stream-009-3-audit.mjs';

const results = await auditWorkerHardening(resolve(process.cwd()));
for (const result of results) {
  console.log(
    `[STREAM-009.3] ${result.passed ? 'PASS' : 'FAIL'}: ${result.name}${result.reason ? ` (${result.reason})` : ''}`,
  );
}
const successful = results.filter((result) => result.passed).length;
console.log(
  `[STREAM-009.3] ${successful}/${results.length} static source checks. Does not certify live transcoding capacity.`,
);
if (successful !== results.length) process.exitCode = 1;
