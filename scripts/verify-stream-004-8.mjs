import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (file) => readFileSync(resolve(root, file), 'utf8');
for (const path of [
  'apps/web/src/features/videos/services/video-upload-flow.ts',
  'apps/web/src/features/videos/services/video-upload-gateway.ts',
  'apps/web/src/features/videos/services/video-upload-xhr.ts',
  'apps/web/src/features/videos/hooks/useVideoUpload.ts',
  'apps/web/src/features/videos/components/VideoUploadPanel.tsx',
  'apps/web/tests/video-upload-flow.test.ts',
  'apps/web/tests/video-upload-xhr.test.ts',
  'docs/development/stream-004-8-upload-ui.md',
])
  assert.ok(existsSync(resolve(root, path)), `Missing STREAM-004.8 file: ${path}`);
const creator = read('apps/web/src/features/videos/components/CreatorVideoManagement.tsx');
assert.match(creator, /import\s*\{\s*VideoUploadPanel\s*\}\s*from\s*['"]\.\/VideoUploadPanel['"]/u);
assert.match(creator, /\bsetUploadingVideoId\b/u);
assert.match(creator, /<VideoUploadPanel\b/u);
assert.match(
  creator,
  /video\.status === ['"]DRAFT['"]\s*\|\|\s*video\.status === ['"]UPLOADING['"]/u,
);
const flow = read('apps/web/src/features/videos/services/video-upload-flow.ts');
assert.match(flow, /SINGLE_PUT_MAX_BYTES = 104_857_600/u);
assert.match(flow, /MAX_UPLOAD_BYTES = 2_147_483_648/u);
assert.match(flow, /partDigests\[String\(number\)\]/u);
assert.match(flow, /gateway\.listParts\(active\.uploadId\)/u);
const xhr = read('apps/web/src/features/videos/services/video-upload-xhr.ts');
assert.match(xhr, /xhr\.withCredentials = false/u);
assert.match(xhr, /xhr\.upload\.addEventListener\('progress'/u);
assert.ok(
  !/axiosInstance|Authorization:\s*['"]Bearer/u.test(xhr),
  'Do not forward API credentials to S3',
);
const rootPackage = JSON.parse(read('package.json'));
const webPackage = JSON.parse(read('apps/web/package.json'));
assert.equal(rootPackage.scripts['verify:web:upload'], 'node scripts/verify-stream-004-8.mjs');
assert.ok(rootPackage.scripts.check.includes('pnpm test:web:upload'));
assert.ok(webPackage.scripts['test:upload:ui'].includes('video-upload-flow.test.ts'));
console.log(
  'PASS: STREAM-004.8 Creator UI -> progress -> multipart recovery -> isolated storage transport',
);
