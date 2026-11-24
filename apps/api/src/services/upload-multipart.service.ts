import {
  CreateMultipartUploadResponseSchema,
  SignMultipartPartResponseSchema,
  CompleteUploadResponseSchema,
  UPLOAD_LIMITS,
  type CreateMultipartUploadRequest,
  type CompleteMultipartUploadRequest,
  type SignMultipartPartResponse,
} from '@streamlab/contracts';
import { expectedPartSize, partCount, verifyMultipartReceipts } from '../lib/multipart-parts.js';
import {
  reserveMultipartSession,
  bindStorageMultipartId,
  failMultipartReservation,
  getOwnedMultipart,
  claimMultipartPart,
  markMultipartAssembled,
  cancelOwnedMultipart,
  type MultipartRecord,
} from '../repositories/upload-multipart.repository.js';
import { AppError } from '../utils/app-error.js';
import { completeUpload } from './upload-complete.service.js';
import { createMultipartStorage } from './upload-multipart-storage.service.js';

export type MultipartStorage = ReturnType<typeof createMultipartStorage>;
export type MultipartDeps = {
  storage: MultipartStorage;
  reserve: typeof reserveMultipartSession;
  bindId: typeof bindStorageMultipartId;
  fail: typeof failMultipartReservation;
  read: typeof getOwnedMultipart;
  claimPart: typeof claimMultipartPart;
  markAssembled: typeof markMultipartAssembled;
  cancel: typeof cancelOwnedMultipart;
  verify: typeof completeUpload;
  clock: () => number;
};

export function createMultipartUploadService(overrides: Partial<MultipartDeps> = {}) {
  // Storage init is lazy so importing this module never requires storage credentials.
  const deps = {
    reserve: reserveMultipartSession,
    bindId: bindStorageMultipartId,
    fail: failMultipartReservation,
    read: getOwnedMultipart,
    claimPart: claimMultipartPart,
    markAssembled: markMultipartAssembled,
    cancel: cancelOwnedMultipart,
    verify: completeUpload,
    clock: Date.now,
    ...overrides,
  };
  const storage = () => overrides.storage ?? createMultipartStorage();
  const location = (record: MultipartRecord) => ({
    videoId: record.videoId,
    uploadId: record.id,
    storageUploadId: record.storageUploadId,
  });
  return {
    async initiate(videoId: string, ownerId: string, input: CreateMultipartUploadRequest) {
      // Defence in depth beyond Zod route validation.
      partCount(BigInt(input.sizeBytes));
      const session = await deps.reserve(videoId, ownerId, input);
      let s3UploadId: string | undefined;
      try {
        s3UploadId = await storage().initiate({
          videoId,
          uploadId: session.id,
          contentType: input.contentType,
        });
        await deps.bindId(session.id, s3UploadId);
      } catch (error) {
        if (s3UploadId) {
          try {
            await storage().abort({ videoId, uploadId: session.id, storageUploadId: s3UploadId });
          } catch (cleanupError) {
            console.error('Multipart initiation abort failed', {
              uploadId: session.id,
              cleanupError,
            });
          }
        }
        try {
          await deps.fail(session.id, videoId);
        } catch (cleanupError) {
          console.error('Multipart reservation cleanup failed', {
            uploadId: session.id,
            cleanupError,
          });
        }
        throw error;
      }
      return CreateMultipartUploadResponseSchema.parse({
        uploadId: session.id,
        videoId: session.videoId,
        mode: 'MULTIPART',
        partSizeBytes: UPLOAD_LIMITS.multipartPartSizeBytes,
        expiresAt: session.expiresAt.toISOString(),
      });
    },
    async signPart(
      uploadId: string,
      ownerId: string,
      partNumber: number,
    ): Promise<SignMultipartPartResponse> {
      const session = await deps.read(uploadId, ownerId);
      expectedPartSize(session.expectedSizeBytes, partNumber);
      const seconds = Math.min(
        UPLOAD_LIMITS.presignedUrlTtlSeconds,
        Math.floor((session.expiresAt.getTime() - deps.clock()) / 1000),
      );
      if (seconds < 1) throw new AppError(410, 'UPLOAD_EXPIRED', 'Upload session expired');
      await deps.claimPart(session, ownerId);
      const signed = await storage().signPart(location(session), partNumber, seconds);
      return SignMultipartPartResponseSchema.parse({
        partNumber,
        method: 'PUT',
        uploadUrl: signed.uploadUrl,
        headers: signed.headers,
        expiresAt: new Date(deps.clock() + seconds * 1000).toISOString(),
      });
    },
    async listParts(uploadId: string, ownerId: string) {
      const session = await deps.read(uploadId, ownerId);
      const parts = await storage().listParts(location(session));
      return {
        uploadId: session.id,
        partSizeBytes: UPLOAD_LIMITS.multipartPartSizeBytes,
        expectedPartCount: partCount(session.expectedSizeBytes),
        parts: parts
          .filter(
            (part) =>
              part.partNumber >= 1 && part.partNumber <= partCount(session.expectedSizeBytes),
          )
          .map((part) => ({
            partNumber: part.partNumber,
            etag: part.etag,
            sizeBytes: part.sizeBytes,
          })),
      };
    },
    async complete(uploadId: string, ownerId: string, input: CompleteMultipartUploadRequest) {
      const session = await deps.read(uploadId, ownerId);
      await deps.claimPart(session, ownerId);
      const locationValue = location(session);
      try {
        const actual = await storage().listParts(locationValue);
        const receipt = verifyMultipartReceipts(session.expectedSizeBytes, actual, input.parts);
        await storage().assemble(locationValue, receipt);
      } catch (error) {
        // Recovery for a crash after S3 assembled the object but before DB CAS.
        if (!(error instanceof Error && error.name === 'NoSuchUpload')) throw error;
        const exists = await storage().hasAssembledObject(locationValue, session.expectedSizeBytes);
        if (!exists) {
          const conflict = new AppError(
            409,
            'MULTIPART_NOT_ASSEMBLED',
            'Multipart upload is not assembled',
          );
          conflict.cause = error;
          throw conflict;
        }
      }
      await deps.markAssembled(session, ownerId);
      // Existing STREAM-004.6 streamed size/signature/SHA-256 verification and trusted copy.
      return CompleteUploadResponseSchema.parse(await deps.verify(uploadId, ownerId));
    },
    async abort(uploadId: string, ownerId: string) {
      const session = await deps.cancel(uploadId, ownerId);
      if (session.storageUploadId) {
        await storage().abort({
          videoId: session.videoId,
          uploadId,
          storageUploadId: session.storageUploadId,
        });
      } else {
        // An assembled staging object may exist even if trusted verification failed.
        await storage().deleteStaging({ videoId: session.videoId, uploadId });
      }
      return { uploadId, status: 'ABORTED' as const };
    },
  };
}

// Default production service instance. Storage is created only when a handler runs.
export const multipartUpload = createMultipartUploadService();
export type MultipartUploadService = ReturnType<typeof createMultipartUploadService>;
