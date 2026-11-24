import {
  CreateUploadSessionResponseSchema,
  UPLOAD_LIMITS,
  type CreateUploadRequest,
  type CreateUploadSessionResponse,
} from '@streamlab/contracts';
import {
  insertOwnedUploadSession,
  type UploadSessionRecord,
} from '../repositories/upload-session.repository.js';
import { AppError } from '../utils/app-error.js';

export type UploadSessionWriter = (
  videoId: string,
  ownerId: string,
  input: CreateUploadRequest,
) => Promise<UploadSessionRecord>;
export type CreateUploadSessionHandler = (
  videoId: string,
  ownerId: string,
  input: CreateUploadRequest,
) => Promise<CreateUploadSessionResponse>;

/** 004.4 creates DB sessions only; 004.5 will sign browser upload URLs. */
export function createUploadSessionService(
  write: UploadSessionWriter = insertOwnedUploadSession,
): CreateUploadSessionHandler {
  return async (videoId, ownerId, input) => {
    // Zod validates the value before this service is called by HTTP.
    if (BigInt(input.sizeBytes) > BigInt(UPLOAD_LIMITS.singlePutLimitBytes)) {
      throw new AppError(413, 'MULTIPART_REQUIRED', 'Files above 100 MiB require multipart upload');
    }
    const record = await write(videoId, ownerId, input);
    return CreateUploadSessionResponseSchema.parse({
      uploadId: record.id,
      videoId: record.videoId,
      mode: record.uploadMode,
      status: record.status,
      expiresAt: record.expiresAt.toISOString(),
    });
  };
}

export const createUploadSession = createUploadSessionService();
