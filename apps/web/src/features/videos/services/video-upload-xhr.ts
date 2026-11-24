import type { PutTransport } from './video-upload-flow.ts';
import { abortUploadError } from './video-upload-flow.ts';

const forbidden = /^(authorization|cookie|x-csrf-token|x-xsrf-token)$/iu;

/**
 * Upload bytes directly to the S3-compatible endpoint, never through Axios.
 * No JWT, CSRF header or browser credentials are forwarded to the signed URL.
 */
export const xhrPutTransport: PutTransport = (signed, blob, { signal, onProgress, expectEtag }) => {
  const url = new URL(signed.uploadUrl);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    signed.method !== 'PUT'
  ) {
    return Promise.reject(new Error('Invalid signed storage URL'));
  }
  for (const key of Object.keys(signed.headers)) {
    if (forbidden.test(key)) return Promise.reject(new Error('Unsafe storage PUT header'));
  }
  if (signal.aborted) return Promise.reject(abortUploadError());
  return new Promise<{ etag?: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', abort);
    const finish = (error?: Error, etag?: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(etag ? { etag } : {});
    };
    const abort = () => xhr.abort();
    xhr.open('PUT', url.toString(), true);
    xhr.withCredentials = false;
    xhr.timeout = 600_000;
    for (const [header, value] of Object.entries(signed.headers))
      xhr.setRequestHeader(header, value);
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(blob.size, event.loaded));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        finish(new Error(`Depolama yükleme hatası (HTTP ${xhr.status}).`));
        return;
      }
      const etag = xhr.getResponseHeader('ETag') ?? undefined;
      if (expectEtag && !etag) {
        finish(new Error('Storage CORS must expose ETag response header'));
        return;
      }
      finish(undefined, etag);
    });
    xhr.addEventListener('error', () =>
      finish(new Error('Depolamaya bağlantı kurulamadı veya CORS izin vermiyor.')),
    );
    xhr.addEventListener('timeout', () =>
      finish(new Error('Depolama isteği zaman aşımına uğradı.')),
    );
    xhr.addEventListener('abort', () => finish(abortUploadError()));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    xhr.send(blob);
  });
};
