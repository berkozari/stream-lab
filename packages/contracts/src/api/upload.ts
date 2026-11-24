import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.js';

/**
 * STREAM-004.2 wire constraints. Mirrored from the accepted STREAM-004.1 policy;
 * tests guard against drift. These are DECLARED metadata checks, not evidence
 * that object-store bytes are safe. Server verification is required at complete.
 */
export const UPLOAD_LIMITS = {
  minFileSizeBytes: 1,
  maxFileSizeBytes: 2_147_483_648,
  singlePutLimitBytes: 104_857_600,
  multipartPartSizeBytes: 8_388_608,
  maxOriginalFileNameLength: 255,
  presignedUrlTtlSeconds: 600,
  uploadSessionTtlSeconds: 86_400,
  maxS3Parts: 10_000,
} as const;

export const UploadContentTypeSchema = z.enum(['video/mp4', 'video/webm']);

// Intentionally a JSON-safe decimal string, never a JS BigInt on the wire.
export const SizeBytesSchema = z.string().regex(/^[1-9][0-9]{0,18}$/u);

const isWithinByteLimit = (value: string, maxBytes: number): boolean =>
  /^[1-9][0-9]{0,18}$/u.test(value) && BigInt(value) <= BigInt(maxBytes);

export const UploadSizeBytesSchema = SizeBytesSchema.refine(
  (value) => isWithinByteLimit(value, UPLOAD_LIMITS.maxFileSizeBytes),
  'File size must be at most 2 GiB',
);

export const UploadChecksumSha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const UploadFileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(UPLOAD_LIMITS.maxOriginalFileNameLength)
  .refine(
    (value) =>
      !value.includes('/') &&
      !value.includes('\\') &&
      Array.from(value).every((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint !== undefined && codePoint >= 32 && codePoint !== 127;
      }),
    'File name must be a display name, not a path or control sequence',
  );

export const UploadStatusSchema = z.enum([
  'INITIATED',
  'UPLOADING',
  'VERIFIED',
  'FAILED',
  'EXPIRED',
]);

export const UploadModeSchema = z.enum(['SINGLE', 'MULTIPART']);

/** Request body for POST /api/v1/videos/:videoId/uploads. */
export const CreateUploadRequestSchema = z
  .strictObject({
    fileName: UploadFileNameSchema,
    contentType: UploadContentTypeSchema,
    sizeBytes: UploadSizeBytesSchema,
    checksumSha256: UploadChecksumSha256Schema.optional(),
  })
  .refine(
    ({ fileName, contentType }) => {
      const lowerName = fileName.toLowerCase();
      return contentType === 'video/mp4'
        ? lowerName.length > 4 && lowerName.endsWith('.mp4')
        : lowerName.length > 5 && lowerName.endsWith('.webm');
    },
    { path: ['fileName'], message: 'File extension must match the declared content type' },
  );

/** Active SINGLE flow in STREAM-004.4/004.5; do not sign >100 MiB PUTs. */
export const CreateSinglePutUploadRequestSchema = CreateUploadRequestSchema.refine(
  ({ sizeBytes }) => isWithinByteLimit(sizeBytes, UPLOAD_LIMITS.singlePutLimitBytes),
  {
    path: ['sizeBytes'],
    message: 'Single PUT is limited to 100 MiB; use multipart',
  },
);

/** Reserved for STREAM-004.7; no multipart endpoints are implemented yet. */
export const CreateMultipartUploadRequestSchema = CreateUploadRequestSchema.refine(
  ({ sizeBytes }) =>
    isWithinByteLimit(sizeBytes, UPLOAD_LIMITS.maxFileSizeBytes) &&
    BigInt(sizeBytes) > BigInt(UPLOAD_LIMITS.singlePutLimitBytes),
  {
    path: ['sizeBytes'],
    message: 'Multipart is only used above 100 MiB',
  },
);

// Existing SINGLE response: retained unchanged for backwards compatibility.
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

/** Planned multipart DTOs; an ETag is not proof of SHA-256 integrity. */
export const MultipartPartNumberSchema = z.number().int().min(1).max(UPLOAD_LIMITS.maxS3Parts);

export const SignMultipartPartRequestSchema = z.strictObject({
  partNumber: MultipartPartNumberSchema,
});

export const SignMultipartPartResponseSchema = z.object({
  partNumber: MultipartPartNumberSchema,
  method: z.literal('PUT'),
  uploadUrl: z.url(),
  headers: z.record(z.string(), z.string()),
  expiresAt: IsoDateTimeSchema,
});

export const MultipartPartReceiptSchema = z.strictObject({
  partNumber: MultipartPartNumberSchema,
  etag: z
    .string()
    .trim()
    .min(1)
    .max(256)
    .refine((value) => !value.includes('\r') && !value.includes('\n'), 'ETag must be one line'),
});

export const CompleteMultipartUploadRequestSchema = z.strictObject({
  parts: z
    .array(MultipartPartReceiptSchema)
    .min(1)
    .max(Math.ceil(UPLOAD_LIMITS.maxFileSizeBytes / UPLOAD_LIMITS.multipartPartSizeBytes))
    .refine(
      (parts) => parts.every((part, index) => part.partNumber === index + 1),
      'Parts must be consecutive and ordered starting at 1',
    ),
});

export const CreateMultipartUploadResponseSchema = z.object({
  uploadId: IdSchema,
  videoId: IdSchema,
  mode: z.literal('MULTIPART'),
  partSizeBytes: z.literal(UPLOAD_LIMITS.multipartPartSizeBytes),
  expiresAt: IsoDateTimeSchema,
});

export type CreateUploadRequest = z.input<typeof CreateUploadRequestSchema>;
export type CreateSinglePutUploadRequest = z.input<typeof CreateSinglePutUploadRequestSchema>;
export type CreateMultipartUploadRequest = z.input<typeof CreateMultipartUploadRequestSchema>;
export type CreateUploadResponse = z.infer<typeof CreateUploadResponseSchema>;
export type CompleteUploadResponse = z.infer<typeof CompleteUploadResponseSchema>;
export type SignMultipartPartRequest = z.infer<typeof SignMultipartPartRequestSchema>;
export type SignMultipartPartResponse = z.infer<typeof SignMultipartPartResponseSchema>;
export type CompleteMultipartUploadRequest = z.infer<typeof CompleteMultipartUploadRequestSchema>;
export type CreateMultipartUploadResponse = z.infer<typeof CreateMultipartUploadResponseSchema>;

/** 004.4 session metadata only; a signed PUT URL is issued separately in 004.5. */
export const CreateUploadSessionResponseSchema = z.strictObject({
  uploadId: IdSchema,
  videoId: IdSchema,
  mode: z.literal('SINGLE'),
  status: z.literal('INITIATED'),
  expiresAt: IsoDateTimeSchema,
});
export type CreateUploadSessionResponse = z.infer<typeof CreateUploadSessionResponseSchema>;

/** STREAM-004.5: revalidate MIME when requesting a short-lived signing capability. */
export const SignUploadRequestSchema = z.strictObject({
  contentType: UploadContentTypeSchema,
});
export type SignUploadRequest = z.infer<typeof SignUploadRequestSchema>;

/** Reuses the established URL-bearing DTO, leaving 004.4 session creation URL-free. */
export const SignUploadResponseSchema = CreateUploadResponseSchema;
export type SignUploadResponse = z.infer<typeof SignUploadResponseSchema>;

/** STREAM-004.7: S3-backed resume metadata for the owned upload only. */
export const MultipartRecoveryResponseSchema = z.strictObject({
  uploadId: IdSchema,
  partSizeBytes: z.literal(UPLOAD_LIMITS.multipartPartSizeBytes),
  expectedPartCount: z.number().int().positive(),
  parts: z.array(
    z.strictObject({
      partNumber: MultipartPartNumberSchema,
      etag: z.string().min(1),
      sizeBytes: z.number().int().positive(),
    }),
  ),
});
export const AbortMultipartUploadResponseSchema = z.strictObject({
  uploadId: IdSchema,
  status: z.literal('ABORTED'),
});
export type MultipartRecoveryResponse = z.infer<typeof MultipartRecoveryResponseSchema>;
