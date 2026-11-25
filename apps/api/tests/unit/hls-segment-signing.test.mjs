import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signHlsSegmentUrls } from '../../src/services/hls-segment-signing.ts';

test('presigning keeps manifest order with limited concurrency', async () => {
  const keys = Array.from({ length: 80 }, (_, i) => `segment_${String(i).padStart(5, '0')}.ts`);
  let active = 0;
  let maxActive = 0;
  const urls = await signHlsSegmentUrls(
    keys,
    async (key) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return `signed:${key}`;
    },
    7,
  );
  assert.ok(maxActive <= 7);
  assert.deepEqual(
    urls,
    keys.map((key) => `signed:${key}`),
  );
});

test('presigning handles empty inputs and validates concurrency', async () => {
  assert.deepEqual(await signHlsSegmentUrls([], async () => 'never'), []);
  await assert.rejects(() => signHlsSegmentUrls(['x'], async () => 'x', 0), RangeError);
  await assert.rejects(() => signHlsSegmentUrls(['x'], async () => 'x', 65), RangeError);
});

test('presigning surfaces failures instead of generating partial playlists', async () => {
  await assert.rejects(
    () =>
      signHlsSegmentUrls(
        ['a', 'b', 'c'],
        async (key) => {
          if (key === 'b') throw new Error('storage sign failed');
          return key;
        },
        2,
      ),
    /storage sign failed/,
  );
});
