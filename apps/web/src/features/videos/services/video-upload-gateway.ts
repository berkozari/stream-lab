import {
  CreateMultipartUploadRequestSchema,
  CreateMultipartUploadResponseSchema,
  CreateSinglePutUploadRequestSchema,
  CreateUploadSessionResponseSchema,
  CompleteMultipartUploadRequestSchema,
  CompleteUploadResponseSchema,
  IdSchema,
  MultipartRecoveryResponseSchema,
  SignMultipartPartResponseSchema,
  SignUploadResponseSchema,
  UploadContentTypeSchema,
} from '@streamlab/contracts';
import { axiosInstance } from '@/lib/axios';
import type { UploadFile, UploadGateway, SignedPut } from './video-upload-flow';

type Success<T> = { success: true; data: T };

/** All authenticated API traffic goes through the application's existing Axios instance. */
async function post(path: string, body: unknown): Promise<unknown> {
  const response = await axiosInstance.post<Success<unknown>>(path, body);
  return response.data.data;
}
async function get(path: string): Promise<unknown> {
  const response = await axiosInstance.get<Success<unknown>>(path);
  return response.data.data;
}

export const videoUploadGateway: UploadGateway = {
  async createSingle(videoId: string, file: UploadFile) {
    const payload = CreateSinglePutUploadRequestSchema.parse({
      fileName: file.name,
      contentType: file.type,
      sizeBytes: String(file.size),
    });
    const result = CreateUploadSessionResponseSchema.parse(
      await post(`/videos/${IdSchema.parse(videoId)}/uploads`, payload),
    );
    if (result.videoId !== videoId) throw new Error('Video upload session mismatch');
    return { uploadId: result.uploadId, expiresAt: result.expiresAt };
  },
  async signSingle(uploadId: string, contentType: string): Promise<SignedPut> {
    const signed = SignUploadResponseSchema.parse(
      await post(`/uploads/${IdSchema.parse(uploadId)}/sign`, {
        contentType: UploadContentTypeSchema.parse(contentType),
      }),
    );
    if (
      signed.uploadId !== uploadId ||
      signed.mode !== 'SINGLE' ||
      signed.method !== 'PUT' ||
      signed.headers['Content-Type'] !== contentType
    )
      throw new Error('Single PUT signing mismatch');
    return { uploadUrl: signed.uploadUrl, headers: signed.headers, method: signed.method };
  },
  async createMultipart(videoId: string, file: UploadFile) {
    const payload = CreateMultipartUploadRequestSchema.parse({
      fileName: file.name,
      contentType: file.type,
      sizeBytes: String(file.size),
    });
    const result = CreateMultipartUploadResponseSchema.parse(
      await post(`/videos/${IdSchema.parse(videoId)}/uploads/multipart`, payload),
    );
    if (result.videoId !== videoId || result.mode !== 'MULTIPART')
      throw new Error('Multipart session mismatch');
    return {
      uploadId: result.uploadId,
      expiresAt: result.expiresAt,
      partSizeBytes: result.partSizeBytes,
    };
  },
  async signPart(uploadId: string, partNumber: number): Promise<SignedPut> {
    const result = SignMultipartPartResponseSchema.parse(
      await post(`/uploads/${IdSchema.parse(uploadId)}/parts/sign`, { partNumber }),
    );
    if (result.partNumber !== partNumber || result.method !== 'PUT')
      throw new Error('Multipart signing mismatch');
    return { uploadUrl: result.uploadUrl, method: result.method, headers: result.headers };
  },
  async listParts(uploadId: string) {
    const result = MultipartRecoveryResponseSchema.parse(
      await get(`/uploads/${IdSchema.parse(uploadId)}/parts`),
    );
    if (result.uploadId !== uploadId) throw new Error('Multipart recovery mismatch');
    return {
      expectedPartCount: result.expectedPartCount,
      partSizeBytes: result.partSizeBytes,
      parts: result.parts,
    };
  },
  async completeSingle(uploadId: string) {
    return CompleteUploadResponseSchema.parse(
      await post(`/uploads/${IdSchema.parse(uploadId)}/complete`, {}),
    );
  },
  async completeMultipart(uploadId: string, parts: Array<{ partNumber: number; etag: string }>) {
    const payload = CompleteMultipartUploadRequestSchema.parse({ parts });
    return CompleteUploadResponseSchema.parse(
      await post(`/uploads/${IdSchema.parse(uploadId)}/multipart/complete`, payload),
    );
  },
  async abortMultipart(uploadId: string) {
    const result = await axiosInstance.delete<Success<{ uploadId: string; status: string }>>(
      `/uploads/${IdSchema.parse(uploadId)}/multipart`,
    );
    if (result.data.data.uploadId !== uploadId || result.data.data.status !== 'ABORTED') {
      throw new Error('Multipart abort mismatch');
    }
  },
};
