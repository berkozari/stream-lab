import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type S3Client,
  type HeadObjectCommandOutput,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { type StorageConfig, readStorageConfig } from '../config/storage-env.js';
import { createStagingObjectKey, createVerifiedOriginalKey } from '../lib/storage-keys.js';
import { verifyUploadBytes } from '../lib/upload-content.js';
import { AppError } from '../utils/app-error.js';
import { createStorageClient } from './storage.service.js';

export type VerifiedOriginal = {
  storageKey: string;
  sizeBytes: bigint;
  contentType: 'video/mp4' | 'video/webm';
  sha256Hex: string;
};

function isChangedObject(error: unknown): boolean {
  return (
    error instanceof Error &&
    ['PreconditionFailed', 'ConditionalRequestConflict'].includes(error.name)
  );
}

function isMissingObject(error: unknown): boolean {
  return error instanceof Error && ['NotFound', 'NoSuchKey'].includes(error.name);
}

function bytesFromS3(body: unknown): AsyncIterable<Uint8Array> {
  if (
    !body ||
    typeof body !== 'object' ||
    !(Symbol.asyncIterator in body) ||
    typeof body[Symbol.asyncIterator] !== 'function'
  )
    throw new AppError(502, 'STORAGE_STREAM_INVALID', 'Storage did not return a byte stream');
  return body as AsyncIterable<Uint8Array>;
}

/**
 * A presigned URL can overwrite staging until expiry. Verify source bytes, copy
 * conditionally by source ETag into a browser-unwritable bucket, then verify
 * destination bytes again before committing database state.
 */
export function createUploadVerificationStorage(
  options: { config?: StorageConfig; client?: S3Client } = {},
) {
  const config = options.config ?? readStorageConfig();
  const client = options.client ?? createStorageClient(config);
  return {
    async promote(upload: {
      videoId: string;
      uploadId: string;
      expectedSizeBytes: bigint;
      checksumSha256: string | null;
    }): Promise<VerifiedOriginal> {
      const key = createStagingObjectKey(upload.videoId, upload.uploadId);
      let head: HeadObjectCommandOutput;
      try {
        head = await client.send(new HeadObjectCommand({ Bucket: config.uploadBucket, Key: key }));
      } catch (error) {
        if (isMissingObject(error)) {
          throw new AppError(409, 'UPLOAD_NOT_FOUND_IN_STORAGE', 'Upload bytes have not arrived');
        }
        throw error;
      }
      if (!head.ETag || head.ContentLength === undefined) {
        throw new AppError(409, 'UPLOAD_INCOMPLETE', 'Storage object metadata is incomplete');
      }
      if (BigInt(head.ContentLength) !== upload.expectedSizeBytes) {
        throw new AppError(422, 'UPLOAD_SIZE_MISMATCH', 'Uploaded size differs from session');
      }
      let source: GetObjectCommandOutput;
      try {
        source = await client.send(
          new GetObjectCommand({ Bucket: config.uploadBucket, Key: key, IfMatch: head.ETag }),
        );
      } catch (error) {
        if (isChangedObject(error)) {
          throw new AppError(
            409,
            'UPLOAD_OBJECT_CHANGED',
            'Upload bytes changed during verification',
          );
        }
        if (isMissingObject(error)) {
          throw new AppError(
            409,
            'UPLOAD_NOT_FOUND_IN_STORAGE',
            'Upload bytes are no longer available',
          );
        }
        throw error;
      }
      const checked = await verifyUploadBytes(
        bytesFromS3(source.Body),
        upload.expectedSizeBytes,
        upload.checksumSha256,
      );
      if (head.ContentType && head.ContentType !== checked.contentType) {
        throw new AppError(
          422,
          'UPLOAD_TYPE_MISMATCH',
          'Uploaded signature does not match Content-Type',
        );
      }
      const verifiedKey = createVerifiedOriginalKey(upload.videoId, upload.uploadId);
      let copyAttempted = false;
      try {
        copyAttempted = true;
        await client.send(
          new CopyObjectCommand({
            Bucket: config.mediaBucket,
            Key: verifiedKey,
            CopySource: `${config.uploadBucket}/${key}`,
            CopySourceIfMatch: head.ETag,
            MetadataDirective: 'REPLACE',
            ContentType: checked.contentType,
          }),
        );
        const result = await client.send(
          new GetObjectCommand({ Bucket: config.mediaBucket, Key: verifiedKey }),
        );
        const confirmed = await verifyUploadBytes(
          bytesFromS3(result.Body),
          upload.expectedSizeBytes,
          checked.sha256Hex,
        );
        if (confirmed.contentType !== checked.contentType) {
          throw new AppError(422, 'UPLOAD_TYPE_MISMATCH', 'Verified copy media type changed');
        }
        return { storageKey: verifiedKey, ...confirmed };
      } catch (error) {
        if (copyAttempted) {
          try {
            await client.send(
              new DeleteObjectCommand({ Bucket: config.mediaBucket, Key: verifiedKey }),
            );
          } catch (cleanupError) {
            // Preserve the original failure; log only the destination key, never a signed URL.
            console.error('Unable to remove failed verified copy', { verifiedKey, cleanupError });
          }
        }
        if (isChangedObject(error)) {
          throw new AppError(
            409,
            'UPLOAD_OBJECT_CHANGED',
            'Upload bytes changed during verification',
          );
        }
        throw error;
      }
    },
    async removeVerified(key: string): Promise<void> {
      if (!/^originals\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/source$/u.test(key)) {
        throw new Error('Refusing deletion outside internally generated original key');
      }
      await client.send(new DeleteObjectCommand({ Bucket: config.mediaBucket, Key: key }));
    },
  };
}
