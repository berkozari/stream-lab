import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDiscoverySearch,
  readDiscoveryFilters,
} from '../src/features/discovery/utils/discovery-search.ts';

test('normalizes search and category from the URL', () => {
  assert.deepEqual(readDiscoveryFilters(new URLSearchParams('q=%20hello%20&category=technology')), {
    q: 'hello',
    category: 'technology',
    limit: 12,
  });
});

test('invalid category slug is ignored', () => {
  assert.deepEqual(readDiscoveryFilters(new URLSearchParams('category=../private')), { limit: 12 });
});

test('search changes do not preserve a stale cursor', () => {
  assert.equal(
    makeDiscoverySearch('  new search  ', 'gaming').toString(),
    'q=new+search&category=gaming',
  );
});

test('empty filters yield public discovery defaults', () => {
  assert.deepEqual(readDiscoveryFilters(new URLSearchParams('q=%20')), { limit: 12 });
});
