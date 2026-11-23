import { z } from 'zod';

export const IdSchema = z.uuid();
export const IsoDateTimeSchema = z.iso.datetime();
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
  requestId: z.string().nullable(),
});
export const SuccessResponseSchema = <T extends z.ZodType>(data: T) =>
  z.object({ success: z.literal(true), data });

export const PageQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ApiErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type PageQuery = z.infer<typeof PageQuerySchema>;
