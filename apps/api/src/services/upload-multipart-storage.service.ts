import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  UploadPartCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UPLOAD_LIMITS } from '@streamlab/contracts';
import { readStorageConfig, type StorageConfig } from '../config/storage-env.js';
import { createStagingObjectKey } from '../lib/storage-keys.js';
import type { StoredMultipartPart } from '../lib/multipart-parts.js';
import { AppError } from '../utils/app-error.js';
import { createStorageClient } from './storage.service.js';

export type MultipartStorageLocation = {
  videoId: string;
  uploadId: string;
  storageUploadId: string;
};

/** Storage-only S3 actions; does not grant authorization or change Prisma state. */
export function createMultipartStorage(
  options: { client?: S3Client; config?: StorageConfig; signer?: typeof getSignedUrl } = {},
) {
  const config = options.config ?? readStorageConfig();
  const client = options.client ?? createStorageClient(config);
  const signer = options.signer ?? getSignedUrl;
  const key = (location: { videoId: string; uploadId: string }) =>
    createStagingObjectKey(location.videoId, location.uploadId);
  return {
    async initiate(location: {
      videoId: string;
      uploadId: string;
      contentType: 'video/mp4' | 'video/webm';
    }) {
      const result = await client.send(
        new CreateMultipartUploadCommand({
          Bucket: config.uploadBucket,
          Key: key(location),
          ContentType: location.contentType,
        }),
      );
      if (!result.UploadId)
        throw new AppError(
          502,
          'STORAGE_UPLOAD_ID_MISSING',
          'Storage did not create a multipart upload',
        );
      return result.UploadId;
    },
    async signPart(
      location: MultipartStorageLocation,
      partNumber: number,
      expiresInSeconds: number,
    ) {
      const command = new UploadPartCommand({
        Bucket: config.uploadBucket,
        Key: key(location),
        UploadId: location.storageUploadId,
        PartNumber: partNumber,
      });
      const url = await signer(client, command, {
        expiresIn: Math.min(UPLOAD_LIMITS.presignedUrlTtlSeconds, expiresInSeconds),
      });
      return { uploadUrl: url, headers: {} as Record<string, string> };
    },
    async listParts(location: MultipartStorageLocation): Promise<StoredMultipartPart[]> {
      const parts: StoredMultipartPart[] = [];
      let marker: string | undefined;
      for (;;) {
        const output = await client.send(
          new ListPartsCommand({
            Bucket: config.uploadBucket,
            Key: key(location),
            UploadId: location.storageUploadId,
            PartNumberMarker: marker,
          }),
        );
        for (const part of output.Parts ?? []) {
          if (part.PartNumber === undefined || part.Size === undefined || !part.ETag) {
            throw new AppError(
              502,
              'STORAGE_PART_INVALID',
              'Storage returned incomplete part metadata',
            );
          }
          parts.push({ partNumber: part.PartNumber, etag: part.ETag, sizeBytes: part.Size });
        }
        if (!output.IsTruncated) break;
        const next = output.NextPartNumberMarker;
        if (!next || next === marker || parts.length > UPLOAD_LIMITS.maxS3Parts) {
          throw new AppError(502, 'STORAGE_PART_PAGINATION', 'Invalid multipart part pagination');
        }
        marker = next;
      }
      return parts;
    },
    async assemble(
      location: MultipartStorageLocation,
      parts: Array<{ PartNumber: number; ETag: string }>,
    ) {
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: config.uploadBucket,
          Key: key(location),
          UploadId: location.storageUploadId,
          MultipartUpload: { Parts: parts },
        }),
      );
    },
    async hasAssembledObject(
      location: { videoId: string; uploadId: string },
      expectedSize: bigint,
    ) {
      try {
        const head = await client.send(
          new HeadObjectCommand({ Bucket: config.uploadBucket, Key: key(location) }),
        );
        return head.ContentLength !== undefined && BigInt(head.ContentLength) === expectedSize;
      } catch (error) {
        if (error instanceof Error && ['NotFound', 'NoSuchKey'].includes(error.name)) return false;
        throw error;
      }
    },
    async deleteStaging(location: { videoId: string; uploadId: string }) {
      await client.send(
        new DeleteObjectCommand({ Bucket: config.uploadBucket, Key: key(location) }),
      );
    },
    async abort(location: MultipartStorageLocation) {
      try {
        await client.send(
          new AbortMultipartUploadCommand({
            Bucket: config.uploadBucket,
            Key: key(location),
            UploadId: location.storageUploadId,
          }),
        );
      } catch (error) {
        if (!(error instanceof Error && ['NoSuchUpload', 'NotFound'].includes(error.name)))
          throw error;
      }
    },
  };
}
