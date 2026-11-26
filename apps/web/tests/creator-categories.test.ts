import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_VIDEO_CATEGORIES,
  toggleVideoCategory,
} from '../src/features/videos/utils/video-category-selection.ts';

test('creator can select and deselect multiple distinct categories', () => {
  const first = toggleVideoCategory([], 'category-one');
  const second = toggleVideoCategory(first, 'category-two');
  assert.deepEqual(second, ['category-one', 'category-two']);
  assert.deepEqual(toggleVideoCategory(second, 'category-one'), ['category-two']);
  assert.deepEqual(first, ['category-one']);
});

test('reselecting an item does not introduce duplicate category IDs', () => {
  const current = ['a', 'b'];
  assert.deepEqual(toggleVideoCategory(toggleVideoCategory(current, 'a'), 'a'), ['b', 'a']);
  assert.deepEqual(current, ['a', 'b']);
});

test('selection stays under 10 categories while existing items remain removable', () => {
  const full = Array.from({ length: MAX_VIDEO_CATEGORIES }, (_, index) => `category-${index}`);
  assert.deepEqual(toggleVideoCategory(full, 'new'), full);
  assert.equal(toggleVideoCategory(full, 'category-0').length, MAX_VIDEO_CATEGORIES - 1);
});
