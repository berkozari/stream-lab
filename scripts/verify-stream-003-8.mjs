import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const files = [
  'apps/web/src/pages/creator/CreatorDashboardPage.tsx',
  'apps/web/src/features/videos/components/CreatorVideoManagement.tsx',
  'apps/web/src/features/videos/components/VideoMetadataForm.tsx',
  'apps/web/src/features/videos/components/VideoDeleteDialog.tsx',
  'apps/web/src/features/videos/utils/video-ui.utils.ts',
  'apps/web/tests/video-ui.test.ts',
];
for (const file of files) assert.ok(existsSync(resolve(root, file)), `Missing: ${file}`);

const creator = read(files[0]);
const ui = read(files[1]);
const form = read(files[2]);
const dialog = read(files[3]);
const utils = read(files[4]);
const rootPkg = JSON.parse(read('package.json'));
const webPkg = JSON.parse(read('apps/web/package.json'));
assert.ok(
  creator.includes('<CreatorVideoManagement />'),
  'Creator page must use video management UI',
);
for (const hook of ['useMyVideos', 'useCreateVideo', 'useUpdateVideo', 'useDeleteVideo']) {
  assert.ok(ui.includes(hook), `Missing existing TanStack Query hook: ${hook}`);
}
for (const item of [
  'fetchNextPage',
  'hasNextPage',
  'role="search"',
  'VideoDeleteDialog',
  'VideoMetadataForm',
]) {
  assert.ok(ui.includes(item), `Missing video UI integration: ${item}`);
}
assert.ok(form.includes('validateVideoMetadata('), 'Form must call shared Zod-backed validation');
assert.ok(
  dialog.includes('dialog.showModal()'),
  'Delete confirmation must use accessible native dialog',
);
assert.ok(utils.includes('CreateVideoRequestSchema.safeParse'), 'Must reuse contract Zod schema');
assert.ok(rootPkg.scripts?.check?.includes('pnpm test:web:video:ui'), 'Missing UI check entry');
assert.ok(
  webPkg.scripts?.['test:video:ui']?.includes('video-ui.test.ts'),
  'Missing UI test script',
);
console.log('PASS: STREAM-003.8 Creator CRUD UI -> TanStack hooks -> Zod -> modal -> tests');
