/** Manual/scheduled maintenance. Dry-run by default, with bounded explicit writes. */
import { prisma, disconnectDatabase } from '../src/config/database.js';
import {
  DEFAULT_ANALYTICS_PURGE_BATCH_SIZE,
  DEFAULT_ANALYTICS_RETENTION_DAYS,
  MAX_ANALYTICS_PURGE_BATCHES,
  MAX_ANALYTICS_PURGE_BATCH_SIZE,
  MIN_ANALYTICS_RETENTION_DAYS,
  MAX_ANALYTICS_RETENTION_DAYS,
  analyticsRetentionCutoff,
  parseBoundedInteger,
} from '../src/lib/analytics-retention.js';
import {
  countExpiredAnalyticsSessions,
  purgeExpiredAnalyticsBatch,
} from '../src/repositories/analytics-retention.repository.js';

type Options = { apply: boolean; days: number; batchSize: number; maxBatches: number };
function optionsFromArgs(args: string[]): Options {
  const options: Options = {
    apply: false,
    days: DEFAULT_ANALYTICS_RETENTION_DAYS,
    batchSize: DEFAULT_ANALYTICS_PURGE_BATCH_SIZE,
    maxBatches: 10,
  };
  const keys = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) throw new Error('Missing option');
    if (arg === '--apply') {
      if (keys.has(arg)) throw new Error('Duplicate --apply flag');
      keys.add(arg);
      options.apply = true;
      continue;
    }
    if (!['--days', '--batch-size', '--max-batches'].includes(arg)) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (keys.has(arg)) throw new Error(`Duplicate option: ${arg}`);
    keys.add(arg);
    const value = args[++i];
    if (!value) throw new Error(`Missing value for ${arg}`);
    if (arg === '--days') {
      options.days = parseBoundedInteger(
        value,
        arg,
        MIN_ANALYTICS_RETENTION_DAYS,
        MAX_ANALYTICS_RETENTION_DAYS,
      );
    } else if (arg === '--batch-size') {
      options.batchSize = parseBoundedInteger(value, arg, 1, MAX_ANALYTICS_PURGE_BATCH_SIZE);
    } else {
      options.maxBatches = parseBoundedInteger(value, arg, 1, MAX_ANALYTICS_PURGE_BATCHES);
    }
  }
  return options;
}

async function run(): Promise<void> {
  const opts = optionsFromArgs(process.argv.slice(2));
  const cutoff = analyticsRetentionCutoff(new Date(), opts.days);
  const eligible = await countExpiredAnalyticsSessions(prisma, cutoff);
  console.log(
    `[STREAM-009.4] cutoff=${cutoff.toISOString()} eligible=${eligible} mode=${opts.apply ? 'APPLY' : 'DRY_RUN'}`,
  );
  if (!opts.apply) return;
  // Production operations must explicitly opt in; no deletion during build/test/bootstrap.
  if (process.env.ANALYTICS_RETENTION_APPLY_ACK !== 'archive-and-purge') {
    throw new Error('Apply requires ANALYTICS_RETENTION_APPLY_ACK=archive-and-purge');
  }
  let deleted = 0;
  let batches = 0;
  while (batches < opts.maxBatches) {
    const result = await purgeExpiredAnalyticsBatch(prisma, cutoff, opts.batchSize);
    deleted += result.deletedCount;
    batches++;
    console.log(
      `[STREAM-009.4] batch=${batches} archivedVideos=${result.archiveUpdates} purged=${result.deletedCount}`,
    );
    if (result.deletedCount < opts.batchSize) break;
  }
  console.log(
    `[STREAM-009.4] complete batches=${batches} purged=${deleted} bounded=${batches === opts.maxBatches}`,
  );
}

try {
  await run();
} catch (error) {
  console.error('[STREAM-009.4] failed:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
