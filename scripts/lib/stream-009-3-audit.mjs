import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const groups = [
  {
    name: 'Bounded and validated worker resource configuration',
    file: 'apps/worker/src/services/transcoding/resource-budget.ts',
    patterns: [
      'readTranscodingBudget',
      'TRANSCODE_MAX_DURATION_SECONDS',
      'TRANSCODE_MAX_SOURCE_PIXELS',
      'TRANSCODE_MIN_SCRATCH_FREE_BYTES',
      'TRANSCODE_FFMPEG_THREADS',
      'TRANSCODING_CONFIG_INVALID',
    ],
  },
  {
    name: 'Source preflight before download',
    file: 'apps/worker/src/services/transcoding/publish-hls.ts',
    patterns: [
      'admitSource?.(source.sizeBytes, signal)',
      'const local = await deps.download',
      'assertSourceScratchCapacity',
    ],
    ordered: ['admitSource?.(source.sizeBytes, signal)', 'const local = await deps.download'],
  },
  {
    name: 'Video preflight before encoding',
    file: 'apps/worker/src/services/transcoding/publish-hls.ts',
    patterns: [
      'admitEncode?.(probe, signal)',
      'const encoded = await deps.encode',
      'assertTranscodingResources',
    ],
    ordered: ['admitEncode?.(probe, signal)', 'const encoded = await deps.encode'],
  },
  {
    name: 'Permanent limits and retryable scratch failures',
    file: 'apps/worker/src/services/transcoding/resource-budget.ts',
    patterns: [
      'new UnrecoverableError',
      'TRANSCODING_MEDIA_BUDGET_EXCEEDED',
      'TRANSCODING_HLS_OBJECT_BUDGET_EXCEEDED',
      'TRANSCODING_SCRATCH_INSUFFICIENT',
      'TRANSCODING_SCRATCH_CHECK_FAILED',
    ],
  },
  {
    name: 'Bounded FFmpeg time and CPU threads',
    file: 'apps/worker/src/services/transcoding/ffmpeg-hls.ts',
    patterns: [
      '-threads',
      '-filter_threads',
      'budget.ffmpegThreads',
      'budget.ffmpegProfileTimeoutMs',
      'windowsHide: true',
      'signal,',
    ],
  },
  {
    name: 'Remote HLS manifest bounded to cleanup capability',
    file: 'apps/worker/src/services/storage/hls-objects.ts',
    patterns: ['files.length > MAX_HLS_OBJECTS_PER_ATTEMPT', 'HLS_UPLOAD_MANIFEST_INVALID'],
  },
  {
    name: 'Worker resource, shutdown and upload tests present',
    file: 'apps/worker/package.json',
    patterns: [
      'test:hardening',
      'resource-budget.test.ts',
      'video-transcode-shutdown.test.ts',
      'hls-storage.test.ts',
    ],
  },
  {
    name: 'Configuration and rollout guidance',
    file: 'docs/stream-009.3-worker-reliability.md',
    patterns: [
      'TRANSCODE_MIN_SCRATCH_FREE_BYTES',
      'UnrecoverableError',
      'Scratch',
      'FFmpeg',
      'production',
      'staging',
    ],
  },
];

export async function auditWorkerHardening(root) {
  const results = [];
  for (const group of groups) {
    let source = '';
    try {
      source = await readFile(join(root, group.file), 'utf8');
    } catch {
      results.push({ name: group.name, passed: false, reason: `missing ${group.file}` });
      continue;
    }
    const missing = group.patterns.filter((pattern) => !source.includes(pattern));
    let ordered = true;
    if (group.ordered) {
      const positions = group.ordered.map((value) => source.indexOf(value));
      ordered = positions.every(
        (position, i) => position !== -1 && (i === 0 || position > positions[i - 1]),
      );
    }
    results.push({
      name: group.name,
      passed: missing.length === 0 && ordered,
      reason: missing.length
        ? `missing markers: ${missing.join(', ')}`
        : !ordered
          ? 'execution order mismatch'
          : undefined,
    });
  }
  return results;
}
