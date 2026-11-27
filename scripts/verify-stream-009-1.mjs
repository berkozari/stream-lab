#!/usr/bin/env node
/** Read-only source evidence audit: does not touch Git, DB or remote services. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectRepo } from './lib/stream-009-1-audit.mjs';

if (process.argv.length > 2) {
  console.error('Usage: node scripts/verify-stream-009-1.mjs');
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = inspectRepo(root);
for (const item of report.evidence) {
  const status = item.missing.length === 0 ? 'PASS' : 'MISSING';
  console.log(`[STREAM-009.1] ${status}: ${item.area}`);
  for (const name of item.missing) console.error(`[STREAM-009.1] Missing: ${name}`);
}
console.log(
  `[STREAM-009.1] ${report.concreteExampleKeys.length ? 'WARN' : 'INFO'}: example configuration contains ${report.concreteExampleKeys.length} populated sensitive-key field(s); actual values are never printed. Review 009-F01.`,
);
console.log(
  `[STREAM-009.1] ${report.ciWorkflowPresent ? 'INFO' : 'WARN'}: GitHub Actions workflow ${report.ciWorkflowPresent ? 'present' : 'not present in the inspected source'}. Review 009-F03.`,
);
if (report.missing.length) {
  console.error('[STREAM-009.1] FAIL: audit evidence incomplete.');
  process.exit(1);
}
console.log(
  `[STREAM-009.1] PASS: ${report.ready}/${report.evidence.length} static evidence groups. This does not certify production readiness.`,
);
