import { resolve } from 'node:path';
import { auditAnalyticsLifecycle } from './lib/stream-009-4-audit.mjs';

const results = await auditAnalyticsLifecycle(resolve(process.cwd()));
for (const result of results) {
  console.log(
    `[STREAM-009.4] ${result.passed ? 'PASS' : 'FAIL'}: ${result.name}${result.reason ? ` (${result.reason})` : ''}`,
  );
}
const passing = results.filter((result) => result.passed).length;
console.log(
  `[STREAM-009.4] ${passing}/${results.length} static source checks. Does not prove live PostgreSQL behavior.`,
);
if (passing !== results.length) process.exitCode = 1;
