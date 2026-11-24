import { randomUUID } from 'node:crypto';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function assertId(value: string, label: string): string {
  if (!uuidPattern.test(value)) throw new Error(`${label} must be a UUID`);
  return value.toLowerCase();
}

/** No filename, client-provided object key or path component is ever accepted. */
export function createStagingObjectKey(videoId: string, uploadId: string): string {
  return `staging/${assertId(videoId, 'videoId')}/${assertId(uploadId, 'uploadId')}/source`;
}

/** Internal-only key. Never sign browser writes to this key. */
export function createVerifiedOriginalKey(videoId: string, uploadId: string): string {
  return `originals/${assertId(videoId, 'videoId')}/${assertId(uploadId, 'uploadId')}/${randomUUID()}/source`;
}
