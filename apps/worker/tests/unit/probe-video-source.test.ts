import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createProbeTranscodingSource,
  type SourceProbeDependencies,
} from '../../src/services/transcoding/probe-video-source.js';

const job = {
  contractVersion: 1 as const,
  videoId: '123e4567-e89b-42d3-a456-426614174000',
  processingVersion: 1,
};
const metadata = { durationSeconds: 3, width: 640, height: 360, codec: 'h264', hasAudio: false };

function fixtures() {
  const calls: string[] = [];
  const deps: SourceProbeDependencies = {
    resolveSource: async () => {
      calls.push('resolve');
      return { storageKey: 'originals/a/b/c/source', sizeBytes: 17n };
    },
    download: async () => {
      calls.push('download');
      return {
        filePath: '/local/source',
        cleanup: async () => {
          calls.push('cleanup');
        },
      };
    },
    probe: async () => {
      calls.push('probe');
      return metadata;
    },
  };
  return { calls, deps };
}

test('probes source and always cleans temporary files', async () => {
  const { calls, deps } = fixtures();
  assert.deepEqual(await createProbeTranscodingSource(deps)(job), metadata);
  assert.deepEqual(calls, ['resolve', 'download', 'probe', 'cleanup']);
});

test('cleans temporary files even when probe rejects', async () => {
  const { calls, deps } = fixtures();
  deps.probe = async () => {
    calls.push('probe');
    throw new Error('probe-failed');
  };
  await assert.rejects(createProbeTranscodingSource(deps)(job), /probe-failed/);
  assert.deepEqual(calls, ['resolve', 'download', 'probe', 'cleanup']);
});

test('rejects invalid jobs before DB or object storage IO', async () => {
  const { calls, deps } = fixtures();
  await assert.rejects(
    createProbeTranscodingSource(deps)({ ...job, processingVersion: 0 }),
    /too_small|positive/i,
  );
  assert.deepEqual(calls, []);
});
