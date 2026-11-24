import assert from 'node:assert/strict';
import test from 'node:test';
import { xhrPutTransport } from '../src/features/videos/services/video-upload-xhr.ts';

class FakeXHR {
  static latest: FakeXHR | null = null;
  withCredentials = true;
  timeout = 0;
  status = 200;
  headers = new Map<string, string>();
  listeners: Record<string, () => void> = {};
  upload = { addEventListener: (_type: string, _listener: unknown) => {} };
  method = '';
  url = '';
  constructor() {
    FakeXHR.latest = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(key: string, value: string) {
    this.headers.set(key, value);
  }
  addEventListener(name: string, callback: () => void) {
    this.listeners[name] = callback;
  }
  getResponseHeader(name: string) {
    return name === 'ETag' ? '"etag"' : null;
  }
  send() {
    this.listeners.load?.();
  }
  abort() {
    this.listeners.abort?.();
  }
}

test('direct browser S3 PUT uses no cookies or API credentials', async () => {
  const old = globalThis.XMLHttpRequest;
  Object.assign(globalThis, { XMLHttpRequest: FakeXHR });
  try {
    const result = await xhrPutTransport(
      {
        method: 'PUT',
        uploadUrl: 'http://127.0.0.1:9000/staging?X-Amz-Signature=secret',
        headers: { 'Content-Type': 'video/mp4' },
      },
      new Blob(['test']),
      { signal: new AbortController().signal, expectEtag: true, onProgress() {} },
    );
    assert.equal(result.etag, '"etag"');
    assert.equal(FakeXHR.latest?.method, 'PUT');
    assert.equal(FakeXHR.latest?.withCredentials, false);
    assert.deepEqual([...FakeXHR.latest!.headers], [['Content-Type', 'video/mp4']]);
    assert.equal(FakeXHR.latest?.timeout, 600_000);
  } finally {
    Object.assign(globalThis, { XMLHttpRequest: old });
  }
});

test('rejects authorization and cookie headers before opening storage request', async () => {
  await assert.rejects(
    xhrPutTransport(
      {
        method: 'PUT',
        uploadUrl: 'http://127.0.0.1:9000/staging',
        headers: { Authorization: 'Bearer secret' },
      },
      new Blob(['test']),
      { signal: new AbortController().signal, expectEtag: false, onProgress() {} },
    ),
    /Unsafe storage PUT header/,
  );
  await assert.rejects(
    xhrPutTransport(
      { method: 'PUT', uploadUrl: 'file:///etc/passwd', headers: {} },
      new Blob(['test']),
      { signal: new AbortController().signal, expectEtag: false, onProgress() {} },
    ),
    /Invalid signed storage URL/,
  );
});
