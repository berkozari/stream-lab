import test from 'node:test';
import assert from 'node:assert/strict';
import { createCategoryListService } from '../../src/services/category.service.js';

const id = '74d96eb9-a7a6-4c31-98db-1658d5441e65';

test('lists only public category metadata', async () => {
  const list = createCategoryListService(async () => [
    { id, name: 'Technology', slug: 'technology' },
  ]);
  assert.deepEqual(await list(), { items: [{ id, name: 'Technology', slug: 'technology' }] });
});

test('rejects invalid category records at service boundary', async () => {
  const list = createCategoryListService(async () => [{ id, name: '', slug: 'invalid' }]);
  await assert.rejects(list());
});
