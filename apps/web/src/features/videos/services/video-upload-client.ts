import {
  CreateSinglePutUploadRequestSchema,
  CreateUploadSessionResponseSchema,
  IdSchema,
  SignUploadResponseSchema,
  type SignUploadResponse,
} from '@streamlab/contracts';

export type UploadHttpClient = {
  post<T>(path: string, payload: unknown): Promise<{ data: T }>;
};
export type UploadFile = Pick<File, 'name' | 'type' | 'size'> & Blob;
export type DirectPut = typeof fetch;
type Success<T> = { success: true; data: T };

/**
 * API calls go through the authenticated client. S3 PUT uses native fetch,
 * deliberately bypassing Axios auth/CSRF interceptors and cookies.
 * Completion/verification is not implemented until STREAM-004.6.
 */
export function createVideoUploadClient(http: UploadHttpClient, put: DirectPut = fetch) {
  return {
    async uploadSingle(videoId: string, file: UploadFile, signal?: AbortSignal) {
      const id = IdSchema.parse(videoId);
      const declaration = CreateSinglePutUploadRequestSchema.parse({
        fileName: file.name,
        contentType: file.type,
        sizeBytes: String(file.size),
      });
      const created = await http.post<Success<unknown>>(`/videos/${id}/uploads`, declaration);
      const session = CreateUploadSessionResponseSchema.parse(created.data.data);
      const authorized = await http.post<Success<unknown>>(`/uploads/${session.uploadId}/sign`, {
        contentType: declaration.contentType,
      });
      const signed: SignUploadResponse = SignUploadResponseSchema.parse(authorized.data.data);
      if (
        signed.uploadId !== session.uploadId ||
        signed.videoId !== id ||
        signed.method !== 'PUT'
      ) {
        throw new Error('Upload authorization mismatch');
      }
      if (signed.headers['Content-Type'] !== declaration.contentType) {
        throw new Error('Signed content type mismatch');
      }
      const response = await put(signed.uploadUrl, {
        method: 'PUT',
        headers: signed.headers,
        body: file,
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        mode: 'cors',
        cache: 'no-store',
        signal,
      });
      if (!response.ok) throw new Error(`Storage upload failed (HTTP ${response.status})`);
      return { uploadId: session.uploadId, videoId: id, status: 'UPLOADING' as const };
    },
  };
}
