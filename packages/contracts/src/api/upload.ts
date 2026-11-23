import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.js';

// Decimal string is intentional: PostgreSQL BigInt must not be serialized as JS BigInt.
export const SizeBytesSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);
export const UploadStatusSchema = z.enum([
  'INITIATED',
  'UPLOADING',
  'VERIFIED',
  'FAILED',
  'EXPIRED',
]);
export const CreateUploadRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  sizeBytes: SizeBytesSchema,
  checksumSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export const CreateUploadResponseSchema = z.object({
  uploadId: IdSchema,
  videoId: IdSchema,
  mode: z.literal('SINGLE'),
  method: z.literal('PUT'),
  uploadUrl: z.url(),
  headers: z.record(z.string(), z.string()),
  expiresAt: IsoDateTimeSchema,
});
export const CompleteUploadResponseSchema = z.object({
  videoId: IdSchema,
  uploadId: IdSchema,
  status: z.enum(['UPLOADED', 'QUEUED']),
});

export type CreateUploadRequest = z.infer<typeof CreateUploadRequestSchema>;
export type CreateUploadResponse = z.infer<typeof CreateUploadResponseSchema>;
export type CompleteUploadResponse = z.infer<typeof CompleteUploadResponseSchema>;
