import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createUploadStorageService } from '../src/services/storage.service.js';

// Local SILO smoke: verifies signature, actual PUT, HEAD and cleanup only.
// These probe bytes are NOT a valid video and must never enter processing.
const storage = createUploadStorageService();
const location = { videoId: randomUUID(), uploadId: randomUUID() };
const probe = Buffer.from(`streamlab-storage-connectivity-${randomUUID()}`);
try {
  const signed = await storage.signStagingPut({ ...location, contentType: 'video/mp4' });
  assert.equal(signed.method, 'PUT');
  const response = await fetch(signed.url, {
    method: 'PUT',
    headers: signed.headers,
    body: probe,
    signal: AbortSignal.timeout(15_000),
  });
  assert.ok(response.ok, `S3 signed PUT returned HTTP ${response.status}`);
  const metadata = await storage.headStaging(location);
  assert.equal(metadata.sizeBytes, probe.byteLength);
  assert.equal(metadata.contentType, 'video/mp4');
  console.log('PASS: S3 SigV4 presigned PUT -> private staging HEAD -> byte count');
} finally {
  await storage.deleteStaging(location);
  console.log('PASS: staging probe deleted');
}
