import { Buffer } from 'node:buffer';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UPLOAD_LIMITS } from '@streamlab/contracts';
import { readStorageConfig, type StorageConfig } from '../config/storage-env.js';
import { createStagingObjectKey } from '../lib/storage-keys.js';

export type PutUrlSigner = (
  client: S3Client,
  command: PutObjectCommand,
  options: { expiresIn: number; signableHeaders: Set<string>; unhoistableHeaders?: Set<string> },
) => Promise<string>;

export function createStorageClient(config: StorageConfig = readStorageConfig()): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    ...(config.credentials ? { credentials: config.credentials } : {}),
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

export type StagingLocation = { videoId: string; uploadId: string };
export type SignStagingPutInput = StagingLocation & {
  contentType: 'video/mp4' | 'video/webm';
  /** SHA-256 of bytes, lowercase hex. Supplying this binds a storage checksum header. */
  checksumSha256?: string;
  expiresInSeconds?: number;
};

/** Storage primitives only: no API route, no DB transition and no verification claims. */
export function createUploadStorageService(
  options: {
    config?: StorageConfig;
    client?: S3Client;
    signer?: PutUrlSigner;
  } = {},
) {
  const config = options.config ?? readStorageConfig();
  const client = options.client ?? createStorageClient(config);
  const signer: PutUrlSigner = options.signer ?? getSignedUrl;

  return {
    async signStagingPut(input: SignStagingPutInput) {
      const key = createStagingObjectKey(input.videoId, input.uploadId);
      if (input.contentType !== 'video/mp4' && input.contentType !== 'video/webm') {
        throw new Error('Unsupported upload content type');
      }
      if (input.checksumSha256 && !/^[a-f0-9]{64}$/u.test(input.checksumSha256)) {
        throw new Error('checksumSha256 must be lowercase SHA-256 hex');
      }
      const checksum = input.checksumSha256
        ? Buffer.from(input.checksumSha256, 'hex').toString('base64')
        : undefined;
      const ttl = input.expiresInSeconds ?? UPLOAD_LIMITS.presignedUrlTtlSeconds;
      if (!Number.isInteger(ttl) || ttl < 1 || ttl > UPLOAD_LIMITS.presignedUrlTtlSeconds) {
        throw new Error('Presigned URL lifetime must be between 1 and 600 seconds');
      }
      const command = new PutObjectCommand({
        Bucket: config.uploadBucket,
        Key: key,
        ContentType: input.contentType,
        ...(checksum ? { ChecksumSHA256: checksum } : {}),
      });
      const url = await signer(client, command, {
        expiresIn: ttl,
        signableHeaders: new Set(['content-type']),
        ...(checksum ? { unhoistableHeaders: new Set(['x-amz-checksum-sha256']) } : {}),
      });
      // Do not log this bearer-capability URL; the API response layer owns its disclosure.
      return {
        method: 'PUT' as const,
        url,
        headers: {
          'Content-Type': input.contentType,
          ...(checksum ? { 'x-amz-checksum-sha256': checksum } : {}),
        },
        expiresInSeconds: ttl,
      };
    },
    async headStaging(location: StagingLocation) {
      const response = await client.send(
        new HeadObjectCommand({
          Bucket: config.uploadBucket,
          Key: createStagingObjectKey(location.videoId, location.uploadId),
        }),
      );
      // HEAD metadata is not proof of actual media type, full-file hash or immutability.
      return {
        sizeBytes: response.ContentLength,
        contentType: response.ContentType,
        etag: response.ETag,
        lastModified: response.LastModified,
      };
    },
    async deleteStaging(location: StagingLocation): Promise<void> {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.uploadBucket,
          Key: createStagingObjectKey(location.videoId, location.uploadId),
        }),
      );
    },
  };
}
