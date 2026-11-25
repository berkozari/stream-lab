import { cleanupOrphanedHlsObjects } from '../services/storage/hls-orphan-cleanup.js';
import { disconnectWorkerDatabase } from '../config/database.js';

/** Operator command. Defaults to dry-run. Never run as part of normal worker start. */
const args = process.argv.slice(2);
const unknown = args.filter(
  (arg) =>
    arg !== '--execute' && !arg.startsWith('--after=') && !arg.startsWith('--min-age-hours='),
);
if (unknown.length || args.filter((arg) => arg === '--execute').length > 1) {
  console.error('Usage: cleanup-hls-orphans [--execute] [--min-age-hours=48] [--after=hls/...]');
  process.exitCode = 2;
} else {
  try {
    const ageArg = args.find((arg) => arg.startsWith('--min-age-hours='));
    const minAgeMs = ageArg
      ? Number(ageArg.slice('--min-age-hours='.length)) * 60 * 60 * 1000
      : undefined;
    const afterArg = args.find((arg) => arg.startsWith('--after='));
    const report = await cleanupOrphanedHlsObjects({
      execute: args.includes('--execute'),
      minAgeMs,
      startAfter: afterArg?.slice('--after='.length),
    });
    console.info(JSON.stringify(report, null, 2));
    if (report.errors) process.exitCode = 1;
  } catch (error) {
    console.error('[worker] HLS orphan scan failed:', error);
    process.exitCode = 1;
  } finally {
    await disconnectWorkerDatabase();
  }
}
