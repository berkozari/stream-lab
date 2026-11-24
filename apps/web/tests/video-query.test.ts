import assert from 'node:assert/strict';
import test from 'node:test';
import { videoKeys } from '../src/features/videos/hooks/video.keys.ts';
import {
  normalizeVideoFilters,
  videoListSearch,
} from '../src/features/videos/utils/video-query.utils.ts';

test('query filters use the shared validation contract and stable ordering', () => {
  assert.deepEqual(normalizeVideoFilters({ q: '  Tutorial  ', limit: 5 }), {
    q: 'Tutorial',
    limit: 5,
  });
  assert.equal(
    videoListSearch({ cursor: 'next/abc+', limit: 5, q: '  Tutorial  ' }),
    '?q=Tutorial&limit=5&cursor=next%2Fabc%2B',
  );
  assert.throws(() => videoListSearch({ limit: 51 }));
  assert.throws(() => videoListSearch({ q: '   ' }));
});

test('cache keys scope private lists to user and do not include pagination cursor', () => {
  assert.deepEqual(
    videoKeys.publicPages({ q: ' tutorial ', limit: 20, cursor: 'a' }),
    videoKeys.publicPages({ limit: 20, q: 'tutorial', cursor: 'b' }),
  );
  assert.notDeepEqual(videoKeys.minePages('owner-a'), videoKeys.minePages('owner-b'));
  assert.notDeepEqual(videoKeys.minePages('owner-a'), videoKeys.publicPages());
  assert.deepEqual(videoKeys.detail('video-1'), ['videos', 'details', 'video-1']);
});
