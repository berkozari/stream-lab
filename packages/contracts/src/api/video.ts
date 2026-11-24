import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, PageQuerySchema } from './common.js';

export const VideoStatusSchema = z.enum([
  'DRAFT',
  'UPLOADING',
  'UPLOADED',
  'QUEUED',
  'PROCESSING',
  'READY',
  'FAILED',
  'DELETING',
]);
export const VideoVisibilitySchema = z.enum(['PRIVATE', 'UNLISTED', 'PUBLIC']);

const UniqueCategoryIdsSchema = z
  .array(IdSchema)
  .max(10)
  .refine((ids) => new Set(ids).size === ids.length, 'Category IDs must be unique');

export const CreateVideoRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(10_000).nullable().optional(),
  categoryIds: UniqueCategoryIdsSchema.default([]),
});

export const UpdateVideoRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().max(10_000).nullable().optional(),
    categoryIds: UniqueCategoryIdsSchema.optional(),
    visibility: VideoVisibilitySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const VideoResponseSchema = z.object({
  id: IdSchema,
  ownerId: IdSchema,
  title: z.string(),
  description: z.string().nullable(),
  status: VideoStatusSchema,
  visibility: VideoVisibilitySchema,
  durationSeconds: z.number().int().nonnegative().nullable(),
  publishedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export const VideoListQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).max(100).optional(),
}).strict();

export const VideoListResponseSchema = z.object({
  items: z.array(VideoResponseSchema),
  nextCursor: z.string().nullable(),
});
export const VideoProcessingResponseSchema = z.object({
  videoId: IdSchema,
  status: VideoStatusSchema,
  processingVersion: z.number().int().nonnegative(),
  failureMessage: z.string().nullable(),
});

export type CreateVideoRequest = z.input<typeof CreateVideoRequestSchema>;
export type UpdateVideoRequest = z.infer<typeof UpdateVideoRequestSchema>;
export type Video = z.infer<typeof VideoResponseSchema>;
export type VideoListQuery = z.input<typeof VideoListQuerySchema>;
export type VideoProcessingResponse = z.infer<typeof VideoProcessingResponseSchema>;
