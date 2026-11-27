import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createPublishHls,
  type PublishHlsDependencies,
} from '../../src/services/transcoding/publish-hls.js';

const job = {
  contractVersion: 1 as const,
  videoId: '123e4567-e89b-42d3-a456-426614174000',
  processingVersion: 1,
};
const claimToken = '00000000-0000-4000-8000-000000000001';
const probe = { durationSeconds: 3.1, width: 320, height: 240, codec: 'mpeg4', hasAudio: false };

function fixture() {
  const events: string[] = [];
  const deps: PublishHlsDependencies = {
    resolve: async (_job, token) => {
      assert.equal(token, claimToken);
      events.push('resolve');
      return { storageKey: 'original', sizeBytes: 1n };
    },
    download: async () => {
      events.push('download');
      return {
        filePath: '/tmp/test',
        cleanup: async () => {
          events.push('clean-local');
        },
      };
    },
    probe: async () => {
      events.push('probe');
      return probe;
    },
    encode: async () => {
      events.push('encode');
      return {
        profiles: [
          { label: '240p', width: 320, height: 240, videoBitrate: 400000, audioBitrate: 0 },
        ],
        files: [
          {
            relativePath: 'master.m3u8',
            absolutePath: '/tmp/master',
            sizeBytes: 14n,
            contentType: 'application/vnd.apple.mpegurl',
          },
        ],
      };
    },
    upload: async () => {
      events.push('upload');
      return {
        prefix: 'hls/test/',
        masterKey: 'hls/test/master.m3u8',
        keyFor: (path: string) => `hls/test/${path}`,
        cleanup: async () => {
          events.push('clean-remote');
        },
      };
    },
    commit: async (input) => {
      assert.equal(input.durationSeconds, probe.durationSeconds);
      events.push('commit');
    },
  };
  return { deps, events };
}

test('publishes only after heartbeat is drained; cleans local files on success', async () => {
  const { events, deps } = fixture();
  await createPublishHls(deps)({
    job,
    claimToken,
    signal: new AbortController().signal,
    beforeReadyCommit: async () => {
      events.push('quiesce');
    },
  });
  assert.deepEqual(events, [
    'resolve',
    'download',
    'probe',
    'encode',
    'upload',
    'quiesce',
    'commit',
    'clean-local',
  ]);
});

test('failed fenced DB commit removes attempt-scoped uploaded objects', async () => {
  const { events, deps } = fixture();
  deps.commit = async () => {
    events.push('commit');
    throw new Error('TRANSCODING_LEASE_LOST');
  };
  await assert.rejects(
    createPublishHls(deps)({
      job,
      claimToken,
      signal: new AbortController().signal,
      beforeReadyCommit: async () => {
        events.push('quiesce');
      },
    }),
    /TRANSCODING_LEASE_LOST/u,
  );
  assert.ok(events.indexOf('clean-remote') > events.indexOf('commit'));
  assert.ok(events.includes('clean-local'));
});

test('source preflight rejects before download and does not start transcoding', async () => {
  const { events, deps } = fixture();
  deps.admitSource = async () => {
    events.push('admit-source');
    throw new Error('TRANSCODING_SCRATCH_INSUFFICIENT');
  };
  await assert.rejects(
    createPublishHls(deps)({
      job,
      claimToken,
      signal: new AbortController().signal,
      beforeReadyCommit: async () => events.push('quiesce'),
    }),
    /TRANSCODING_SCRATCH_INSUFFICIENT/u,
  );
  assert.deepEqual(events, ['resolve', 'admit-source']);
});

test('post-probe admission rejection cleans local source without writing HLS', async () => {
  const { events, deps } = fixture();
  deps.admitEncode = async () => {
    events.push('admit-encode');
    throw new Error('TRANSCODING_MEDIA_BUDGET_EXCEEDED');
  };
  await assert.rejects(
    createPublishHls(deps)({
      job,
      claimToken,
      signal: new AbortController().signal,
      beforeReadyCommit: async () => events.push('quiesce'),
    }),
    /TRANSCODING_MEDIA_BUDGET_EXCEEDED/u,
  );
  assert.deepEqual(events, ['resolve', 'download', 'probe', 'admit-encode', 'clean-local']);
});
