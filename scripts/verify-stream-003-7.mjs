import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const get = (path) => {
  const absolute = resolve(root, path);
  assert.ok(existsSync(absolute), `Missing STREAM-003.7 file: ${path}`);
  return readFileSync(absolute, 'utf8');
};

const files = [
  'apps/web/src/features/videos/types/video.types.ts',
  'apps/web/src/features/videos/utils/video-query.utils.ts',
  'apps/web/src/features/videos/hooks/video.keys.ts',
  'apps/web/src/features/videos/hooks/useVideoQueries.ts',
  'apps/web/src/features/videos/hooks/useVideoMutations.ts',
  'apps/web/src/features/videos/services/video-client.ts',
  'apps/web/src/features/videos/services/video.service.ts',
  'apps/web/src/features/videos/index.ts',
  'apps/web/tests/video-query.test.ts',
  'apps/web/tests/video-client.test.ts',
  'docs/development/stream-003-7-web-video.md',
];
for (const file of files) assert.ok(get(file).trim().length > 0, `Empty file: ${file}`);

const source = get('apps/web/src/features/videos/services/video-client.ts');
for (const name of ['listPublic', 'listMine', 'detail', 'create', 'update', 'remove']) {
  assert.ok(source.includes(`async ${name}(`), `Missing video client operation: ${name}`);
}
assert.ok(source.includes('CreateVideoRequestSchema.parse'), 'Missing create contract validation');
assert.ok(source.includes('UpdateVideoRequestSchema.parse'), 'Missing update contract validation');
assert.ok(source.includes('VideoListResponseSchema.parse'), 'Missing list response validation');
assert.ok(
  get('apps/web/src/features/videos/services/video.service.ts').includes('axiosInstance'),
  'Video client must reuse authenticated Axios instance',
);

const hooks = get('apps/web/src/features/videos/hooks/useVideoQueries.ts');
assert.ok(hooks.includes('useInfiniteQuery'), 'Missing cursor pagination hooks');
assert.ok(hooks.includes("status === 'authenticated'"), 'Owner list must require authentication');
const mutations = get('apps/web/src/features/videos/hooks/useVideoMutations.ts');
assert.ok(mutations.includes('invalidateQueries'), 'Mutations must invalidate video lists');
assert.ok(mutations.includes('removeQueries'), 'Deletion must clear the detail cache');

const rootPkg = JSON.parse(get('package.json'));
const webPkg = JSON.parse(get('apps/web/package.json'));
assert.equal(rootPkg.scripts['verify:web:video'], 'node scripts/verify-stream-003-7.mjs');
assert.equal(
  rootPkg.scripts['test:web:video'],
  'pnpm --filter @streamlab/contracts build && pnpm --filter @streamlab/web test:video:client',
);
assert.ok(
  rootPkg.scripts.check.includes('pnpm test:web:video'),
  'Missing check pipeline integration',
);
assert.equal(
  webPkg.scripts['test:video:client'],
  'node --experimental-strip-types --test tests/video-query.test.ts tests/video-client.test.ts',
);
console.log('PASS: STREAM-003.7 video client, contracts, pagination, cache and scripts');
