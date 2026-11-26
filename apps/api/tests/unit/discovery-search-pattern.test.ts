import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeLikeLiteral, videoSearchFilter } from '../../src/lib/discovery-search-pattern.js';

test('plain search text is unchanged', () => {
  assert.equal(escapeLikeLiteral('Node.js Türkçe video'), 'Node.js Türkçe video');
});

test('LIKE wildcard percent matches literally', () => {
  assert.equal(escapeLikeLiteral('100%'), '100\\%');
});

test('LIKE wildcard underscore matches literally', () => {
  assert.equal(escapeLikeLiteral('video_1'), 'video\\_1');
});

test('backslash is escaped before wildcards', () => {
  assert.equal(escapeLikeLiteral('a\\b%_'), 'a\\\\b\\%\\_');
});

test('both title and description use the identical escaped text', () => {
  const filter = videoSearchFilter('node_%');
  assert.deepEqual(filter, {
    OR: [
      { title: { contains: 'node\\_\\%', mode: 'insensitive' } },
      { description: { contains: 'node\\_\\%', mode: 'insensitive' } },
    ],
  });
});

test('apostrophes are preserved for Prisma parameterization', () => {
  assert.equal(videoSearchFilter("O'Reilly").OR[0]?.title.contains, "O'Reilly");
});
