import {
  SignUploadResponseSchema,
  UPLOAD_LIMITS,
  type SignUploadRequest,
  type SignUploadResponse,
} from '@streamlab/contracts';
import {
  claimOwnedUploadForSigning,
  type SignableUpload,
} from '../repositories/upload-sign.repository.js';
import { createUploadStorageService, type SignStagingPutInput } from './storage.service.js';
import { AppError } from '../utils/app-error.js';

export type SignUploadReader = (uploadId: string, ownerId: string) => Promise<SignableUpload>;
export type SignedPut = {
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
};
export type SignUploadStorage = (input: SignStagingPutInput) => Promise<SignedPut>;
export type SignUploadHandler = (
  uploadId: string,
  ownerId: string,
  input: SignUploadRequest,
) => Promise<SignUploadResponse>;

/**
 * No S3 operation executes inside a PostgreSQL transaction. The returned URL is
 * a bearer capability and must never be logged, stored, or cached.
 */
export function createSignUploadService(
  read: SignUploadReader = claimOwnedUploadForSigning,
  sign: SignUploadStorage = (input) => createUploadStorageService().signStagingPut(input),
  clock: () => number = Date.now,
): SignUploadHandler {
  return async (uploadId, ownerId, input) => {
    const session = await read(uploadId, ownerId);
    const now = clock();
    const expiresInSeconds = Math.min(
      UPLOAD_LIMITS.presignedUrlTtlSeconds,
      Math.floor((session.expiresAt.getTime() - now) / 1000),
    );
    if (expiresInSeconds < 1) {
      throw new AppError(410, 'UPLOAD_EXPIRED', 'Upload session expired');
    }
    const signed = await sign({
      videoId: session.videoId,
      uploadId: session.uploadId,
      contentType: input.contentType,
      expiresInSeconds,
      ...(session.checksumSha256 ? { checksumSha256: session.checksumSha256 } : {}),
    });
    return SignUploadResponseSchema.parse({
      uploadId: session.uploadId,
      videoId: session.videoId,
      mode: 'SINGLE',
      method: signed.method,
      uploadUrl: signed.url,
      headers: signed.headers,
      expiresAt: new Date(now + expiresInSeconds * 1000).toISOString(),
    });
  };
}

export const signUpload = createSignUploadService();
