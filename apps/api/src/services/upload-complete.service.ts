import { CompleteUploadResponseSchema, type CompleteUploadResponse } from '@streamlab/contracts';
import {
  finalizeOwnedUpload,
  getOwnedUploadToComplete,
  type UploadToComplete,
} from '../repositories/upload-complete.repository.js';
import {
  createUploadVerificationStorage,
  type VerifiedOriginal,
} from './upload-verify-storage.service.js';

export type CompleteUploadReader = (uploadId: string, ownerId: string) => Promise<UploadToComplete>;
export type CompleteUploadWriter = (
  upload: UploadToComplete,
  ownerId: string,
  verified: { storageKey: string; sizeBytes: bigint; contentType: VerifiedOriginal['contentType'] },
) => Promise<void>;
export type CompleteUploadStorage = {
  promote: (upload: UploadToComplete) => Promise<VerifiedOriginal>;
  removeVerified: (key: string) => Promise<void>;
};
export type CompleteUploadHandler = (
  uploadId: string,
  ownerId: string,
) => Promise<CompleteUploadResponse>;

export function createCompleteUploadService(
  read: CompleteUploadReader = getOwnedUploadToComplete,
  write: CompleteUploadWriter = finalizeOwnedUpload,
  storage: CompleteUploadStorage = {
    promote: (upload) => createUploadVerificationStorage().promote(upload),
    removeVerified: (key) => createUploadVerificationStorage().removeVerified(key),
  },
): CompleteUploadHandler {
  return async (uploadId, ownerId) => {
    const session = await read(uploadId, ownerId);
    const verified = await storage.promote(session);
    try {
      await write(session, ownerId, verified);
    } catch (error) {
      // A failed CAS/DB transaction must not leave a processing-visible object behind.
      try {
        await storage.removeVerified(verified.storageKey);
      } catch (cleanupError) {
        console.error('Failed to clean up uncommitted original', {
          key: verified.storageKey,
          cleanupError,
        });
      }
      throw error;
    }
    return CompleteUploadResponseSchema.parse({
      videoId: session.videoId,
      uploadId: session.uploadId,
      status: 'UPLOADED',
    });
  };
}

export const completeUpload = createCompleteUploadService();
