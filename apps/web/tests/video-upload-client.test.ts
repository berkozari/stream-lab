import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  createVideoUploadClient,
  type UploadHttpClient,
} from '../src/features/videos/services/video-upload-client.ts';

const videoId = randomUUID();
const uploadId = randomUUID();
const signedUrl = 'http://127.0.0.1:9000/streamlab-uploads/staging/test?X-Amz-Signature=secret';
const file = new File([new Uint8Array([1, 2, 3])], 'demo.mp4', { type: 'video/mp4' });

function fixture() {
  const calls: Array<{ path: string; payload: unknown }> = [];
  const puts: Array<{ url: string; init: RequestInit | undefined }> = [];
  const http: UploadHttpClient = {
    async post<T>(path: string, payload: unknown) {
      calls.push({ path, payload });
      return {
        data: {
          success: true,
          data: path.endsWith('/sign')
            ? {
                uploadId,
                videoId,
                mode: 'SINGLE',
                method: 'PUT',
                uploadUrl: signedUrl,
                headers: { 'Content-Type': 'video/mp4' },
                expiresAt: new Date(Date.now() + 600_000).toISOString(),
              }
            : {
                uploadId,
                videoId,
                mode: 'SINGLE',
                status: 'INITIATED',
                expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
              },
        } as T,
      };
    },
  };
  const put: typeof fetch = async (url, init) => {
    puts.push({ url: String(url), init });
    return new Response(null, { status: 200 });
  };
  return { client: createVideoUploadClient(http, put), calls, puts };
}

test('browser direct upload uses authenticated API then native PUT without cookies or JWT', async () => {
  const { client, calls, puts } = fixture();
  const result = await client.uploadSingle(videoId, file);
  assert.deepEqual(result, { uploadId, videoId, status: 'UPLOADING' });
  assert.deepEqual(
    calls.map(({ path }) => path),
    [`/videos/${videoId}/uploads`, `/uploads/${uploadId}/sign`],
  );
  assert.deepEqual(calls[0]?.payload, {
    fileName: 'demo.mp4',
    contentType: 'video/mp4',
    sizeBytes: '3',
  });
  assert.deepEqual(calls[1]?.payload, { contentType: 'video/mp4' });
  assert.equal(puts[0]?.url, signedUrl);
  assert.equal(puts[0]?.init?.method, 'PUT');
  assert.equal(puts[0]?.init?.credentials, 'omit');
  assert.equal(puts[0]?.init?.redirect, 'error');
  assert.deepEqual(puts[0]?.init?.headers, { 'Content-Type': 'video/mp4' });
  assert.equal(puts[0]?.init?.body, file);
});

test('invalid file metadata rejects before API calls', async () => {
  const { client, calls, puts } = fixture();
  const invalid = new File(['bad'], '../bad.avi', { type: 'video/x-msvideo' });
  await assert.rejects(client.uploadSingle(videoId, invalid));
  assert.equal(calls.length, 0);
  assert.equal(puts.length, 0);
});

test('failed storage PUT is not incorrectly reported as completed', async () => {
  const { calls } = fixture();
  const http: UploadHttpClient = {
    async post<T>(path: string, payload: unknown) {
      calls.push({ path, payload });
      return {
        data: {
          success: true,
          data: path.endsWith('/sign')
            ? {
                uploadId,
                videoId,
                mode: 'SINGLE',
                method: 'PUT',
                uploadUrl: signedUrl,
                headers: { 'Content-Type': 'video/mp4' },
                expiresAt: new Date(Date.now() + 600_000).toISOString(),
              }
            : {
                uploadId,
                videoId,
                mode: 'SINGLE',
                status: 'INITIATED',
                expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
              },
        } as T,
      };
    },
  };
  const put: typeof fetch = async () => new Response(null, { status: 403 });
  const client = createVideoUploadClient(http, put);
  await assert.rejects(client.uploadSingle(videoId, file), /Storage upload failed/);
});
