import {
  CompleteMultipartUploadRequestSchema,
  CreateMultipartUploadRequestSchema,
  CreateMultipartUploadResponseSchema,
  SignMultipartPartResponseSchema,
  type CreateMultipartUploadRequest,
} from '@streamlab/contracts';
import { type UploadHttpClient, type UploadFile } from './video-upload-client.js';

type Success<T> = { success: true; data: T };
type Receipt = { partNumber: number; etag: string };
const partSize = 8_388_608;

/** S3 requests use plain fetch with credentials omitted; API requests use authenticated Axios. */
export function createVideoMultipartClient(http: UploadHttpClient, put: typeof fetch = fetch) {
  const api = async (url: string, data: unknown): Promise<unknown> =>
    (await http.post<Success<unknown>>(url, data)).data.data;
  return {
    async create(videoId: string, file: UploadFile, sha256?: string) {
      const declaration: CreateMultipartUploadRequest = CreateMultipartUploadRequestSchema.parse({
        fileName: file.name,
        contentType: file.type,
        sizeBytes: String(file.size),
        ...(sha256 ? { checksumSha256: sha256 } : {}),
      });
      return CreateMultipartUploadResponseSchema.parse(
        await api(`/videos/${videoId}/uploads/multipart`, declaration),
      );
    },
    async sign(uploadId: string, partNumber: number) {
      return SignMultipartPartResponseSchema.parse(
        await api(`/uploads/${uploadId}/parts/sign`, { partNumber }),
      );
    },
    async sendPart(
      uploadId: string,
      file: UploadFile,
      partNumber: number,
      signal?: AbortSignal,
    ): Promise<Receipt> {
      const start = (partNumber - 1) * partSize;
      if (start < 0 || start >= file.size) throw new Error('Invalid upload part number');
      const signed = await this.sign(uploadId, partNumber);
      const end = Math.min(start + partSize, file.size);
      const response = await put(signed.uploadUrl, {
        method: 'PUT',
        body: file.slice(start, end),
        headers: signed.headers,
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        mode: 'cors',
        cache: 'no-store',
        signal,
      });
      if (!response.ok) throw new Error(`Multipart PUT failed (HTTP ${response.status})`);
      const etag = response.headers.get('ETag');
      if (!etag) throw new Error('Storage CORS must expose ETag response header');
      return { partNumber, etag };
    },
    async complete(uploadId: string, receipts: Receipt[]) {
      const input = CompleteMultipartUploadRequestSchema.parse({ parts: receipts });
      return api(`/uploads/${uploadId}/multipart/complete`, input);
    },
    // GET /uploads/:id/parts and DELETE /uploads/:id/multipart are exposed by the API.
    // Hook integration and persisted UI recovery state are handled in STREAM-004.8.
  };
}
