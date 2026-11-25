import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  createVideoUploadFlow,
  validateUploadFile,
  uploadRecordKey,
  SINGLE_PUT_MAX_BYTES,
  MAX_UPLOAD_BYTES,
  type UploadGateway,
  type UploadStorage,
  type UploadProgress,
  type PutTransport,
} from '../src/features/videos/services/video-upload-flow.ts';

const ownerId = randomUUID();
const videoId = randomUUID();
const uploadId = randomUUID();
const signed = {
  method: 'PUT' as const,
  uploadUrl: 'http://127.0.0.1:9000/staging?X-Amz-Signature=secret',
  headers: {},
};

function memory(): UploadStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}
function file(size: number, name = 'clip.mp4'): File {
  // Sparse file representation avoids allocating 100 MiB+ in test process.
  return {
    size,
    name,
    type: 'video/mp4',
    lastModified: 1000,
    slice(start: number, end: number) {
      return { size: end - start } as Blob;
    },
  } as File;
}
function gateway(overrides: Partial<UploadGateway> = {}): UploadGateway {
  const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
  return {
    createSingle: async () => ({ uploadId, expiresAt }),
    signSingle: async () => signed,
    createMultipart: async () => ({ uploadId, expiresAt, partSizeBytes: 8_388_608 }),
    signPart: async () => signed,
    listParts: async () => ({ expectedPartCount: 13, partSizeBytes: 8_388_608, parts: [] }),
    completeSingle: async () => ({ uploadId, videoId, status: 'UPLOADED' }),
    completeMultipart: async () => ({ uploadId, videoId, status: 'UPLOADED' }),
    abortMultipart: async () => {},
    ...overrides,
  };
}

test('rejects invalid metadata and bounds before an API call', async () => {
  assert.throws(() => validateUploadFile(file(0)), /1 bayt/);
  assert.throws(() => validateUploadFile(file(MAX_UPLOAD_BYTES + 1)), /2 GiB/);
  assert.throws(() => validateUploadFile(file(2, 'bad.avi')), /MP4/);
  assert.equal(SINGLE_PUT_MAX_BYTES, 104_857_600);
});

test('single PUT verifies after transfer and only then reports 100%', async () => {
  const calls: string[] = [];
  const transport: PutTransport = async (_signed, blob, options) => {
    calls.push('storage');
    assert.equal(options.expectEtag, false);
    options.onProgress(blob.size);
    return {};
  };
  const progress: UploadProgress[] = [];
  const flow = createVideoUploadFlow({
    ownerId,
    storage: memory(),
    transport,
    gateway: gateway({
      createSingle: async () => {
        calls.push('create');
        return { uploadId, expiresAt: new Date(Date.now() + 10_000).toISOString() };
      },
      signSingle: async () => {
        calls.push('sign');
        return signed;
      },
      completeSingle: async () => {
        calls.push('verify');
        return { uploadId, videoId, status: 'QUEUED' };
      },
    }),
  });
  await flow.run({
    videoId,
    file: file(10),
    signal: new AbortController().signal,
    onProgress: (value) => progress.push(value),
  });
  assert.deepEqual(calls, ['create', 'sign', 'storage', 'verify']);
  assert.equal(progress.at(-1)?.phase, 'completed');
  assert.equal(progress.at(-1)?.percent, 100);
  assert.equal(flow.read(videoId), null);
});

test('interrupted single upload re-signs same session without creating another', async () => {
  let creates = 0;
  const store = memory();
  const flow = createVideoUploadFlow({
    ownerId,
    storage: store,
    gateway: gateway({
      createSingle: async () => {
        creates++;
        return { uploadId, expiresAt: new Date(Date.now() + 10_000).toISOString() };
      },
    }),
    transport: async () => {
      if (creates === 1) throw new Error('network');
      return {};
    },
  });
  const inputFile = file(10);
  await assert.rejects(
    flow.run({ videoId, file: inputFile, signal: new AbortController().signal, onProgress() {} }),
    /network/,
  );
  assert.equal(flow.read(videoId)?.uploadId, uploadId);
  await assert.rejects(
    flow.run({ videoId, file: inputFile, signal: new AbortController().signal, onProgress() {} }),
    /Aktif yükleme/,
  );
  // new coordinator uses the same persisted session; failed storage PUT may be repeated.
  const restarted = createVideoUploadFlow({
    ownerId,
    storage: store,
    gateway: gateway(),
    transport: async () => ({}),
  });
  await restarted.run({
    videoId,
    file: inputFile,
    resume: true,
    signal: new AbortController().signal,
    onProgress() {},
  });
  assert.equal(creates, 1);
  assert.equal(restarted.read(videoId), null);
});

test('multipart recovery skips only parts with matching local SHA-256 and server ETag', async () => {
  const size = SINGLE_PUT_MAX_BYTES + 1;
  const inputFile = file(size);
  const storedParts = new Map<number, { partNumber: number; sizeBytes: number; etag: string }>();
  const sent: number[] = [];
  let currentPart = 0;
  const store = memory();
  const abort = new AbortController();
  const api = gateway({
    signPart: async (_id, number) => {
      currentPart = number;
      return signed;
    },
    listParts: async () => ({
      expectedPartCount: 13,
      partSizeBytes: 8_388_608,
      parts: [...storedParts.values()],
    }),
  });
  const transport: PutTransport = async (_signed, _blob, { expectEtag }) => {
    assert.equal(expectEtag, true);
    sent.push(currentPart);
    const etag = `"etag-${currentPart}"`;
    storedParts.set(currentPart, {
      partNumber: currentPart,
      sizeBytes: Math.min(8_388_608, size - (currentPart - 1) * 8_388_608),
      etag,
    });
    if (currentPart === 1) abort.abort();
    return { etag };
  };
  const flow = createVideoUploadFlow({
    ownerId,
    gateway: api,
    transport,
    storage: store,
    digest: async () => 'a'.repeat(64),
  });
  await assert.rejects(
    flow.run({ videoId, file: inputFile, signal: abort.signal, onProgress() {} }),
    (error: unknown) => error instanceof Error && error.name === 'AbortError',
  );
  assert.deepEqual(sent, [1]);
  assert.equal(flow.read(videoId)?.partEtags['1'], '"etag-1"');
  const resumed = createVideoUploadFlow({
    ownerId,
    gateway: api,
    transport,
    storage: store,
    digest: async () => 'a'.repeat(64),
  });
  await resumed.run({
    videoId,
    file: inputFile,
    resume: true,
    signal: new AbortController().signal,
    onProgress() {},
  });
  assert.equal(sent.filter((number) => number === 1).length, 1);
  assert.equal(sent.length, 13);
  assert.equal(resumed.read(videoId), null);
});

test('changed chunk hash never skips an existing S3 part', async () => {
  const size = SINGLE_PUT_MAX_BYTES + 1;
  const inputFile = file(size);
  const store = memory();
  const key = uploadRecordKey(ownerId, videoId);
  store.setItem(
    key,
    JSON.stringify({
      version: 1,
      ownerId,
      videoId,
      uploadId,
      mode: 'MULTIPART',
      fileName: inputFile.name,
      contentType: inputFile.type,
      sizeBytes: inputFile.size,
      lastModified: inputFile.lastModified,
      expiresAt: new Date(Date.now() + 10_000).toISOString(),
      partSizeBytes: 8_388_608,
      partDigests: { '1': 'a'.repeat(64) },
      partEtags: { '1': '"same-etag"' },
    }),
  );
  let signedPart1 = 0;
  const api = gateway({
    signPart: async (_id, number) => {
      if (number === 1) signedPart1++;
      return signed;
    },
    listParts: async () => ({
      expectedPartCount: 13,
      partSizeBytes: 8_388_608,
      parts: [{ partNumber: 1, sizeBytes: 8_388_608, etag: '"same-etag"' }],
    }),
  });
  const flow = createVideoUploadFlow({
    ownerId,
    storage: store,
    gateway: api,
    digest: async () => 'b'.repeat(64),
    transport: async () => ({ etag: '"new-etag"' }),
  });
  await assert.rejects(
    flow.run({
      videoId,
      file: inputFile,
      resume: true,
      signal: new AbortController().signal,
      onProgress() {},
    }),
    /beklenen tüm parçalar/,
  );
  assert.equal(signedPart1, 1);
});

test('multipart abort removes the local record only after API abort succeeds', async () => {
  const store = memory();
  const inputFile = file(SINGLE_PUT_MAX_BYTES + 1);
  const flow = createVideoUploadFlow({
    ownerId,
    storage: store,
    gateway: gateway({
      abortMultipart: async () => {
        throw new Error('storage unavailable');
      },
    }),
    transport: async () => {
      throw new Error('first part failed');
    },
    digest: async () => 'a'.repeat(64),
  });
  await assert.rejects(
    flow.run({ videoId, file: inputFile, signal: new AbortController().signal, onProgress() {} }),
  );
  await assert.rejects(flow.abortMultipart(videoId), /storage unavailable/);
  assert.equal(flow.read(videoId)?.mode, 'MULTIPART');
});

test('records are user-scoped and expire, without storing signed storage URLs', async () => {
  const store = memory();
  const flow = createVideoUploadFlow({
    ownerId,
    gateway: gateway(),
    storage: store,
    transport: async () => {
      throw new Error('pause');
    },
  });
  await assert.rejects(
    flow.run({ videoId, file: file(30), signal: new AbortController().signal, onProgress() {} }),
  );
  const raw = store.getItem(uploadRecordKey(ownerId, videoId)) ?? '';
  assert.ok(raw.includes(uploadId));
  assert.ok(!raw.includes('X-Amz-Signature'));
  assert.equal(
    createVideoUploadFlow({
      ownerId: randomUUID(),
      gateway: gateway(),
      storage: store,
      transport: async () => ({}),
    }).read(videoId),
    null,
  );
});

test('invalid server completion response never claims upload success', async () => {
  const flow = createVideoUploadFlow({
    ownerId,
    gateway: gateway({
      completeSingle: async () => ({ uploadId: randomUUID(), videoId, status: 'QUEUED' }),
    }),
    storage: memory(),
    transport: async () => ({}),
  });
  const seen: UploadProgress[] = [];
  await assert.rejects(
    flow.run({
      videoId,
      file: file(10),
      signal: new AbortController().signal,
      onProgress: (value) => seen.push(value),
    }),
    /tamamlama yanıtı/,
  );
  assert.equal(seen.at(-1)?.phase, 'failed');
  assert.ok(flow.read(videoId));
});

test('invalid server completion status is rejected even when session IDs match', async () => {
  const flow = createVideoUploadFlow({
    ownerId,
    gateway: gateway({
      completeSingle: async () => ({ uploadId, videoId, status: 'PROCESSING' }),
    }),
    storage: memory(),
    transport: async () => ({}),
  });
  await assert.rejects(
    flow.run({
      videoId,
      file: file(10),
      signal: new AbortController().signal,
      onProgress() {},
    }),
    /tamamlama yanıtı/,
  );
  assert.ok(flow.read(videoId));
});

test('successful multipart abort clears only the scoped session record', async () => {
  const store = memory();
  const flow = createVideoUploadFlow({
    ownerId,
    storage: store,
    gateway: gateway(),
    transport: async () => {
      throw new Error('interrupted');
    },
    digest: async () => 'a'.repeat(64),
  });
  await assert.rejects(
    flow.run({
      videoId,
      file: file(SINGLE_PUT_MAX_BYTES + 1),
      signal: new AbortController().signal,
      onProgress() {},
    }),
  );
  assert.ok(flow.read(videoId));
  await flow.abortMultipart(videoId);
  assert.equal(flow.read(videoId), null);
});
