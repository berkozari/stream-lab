import { z } from 'zod';
import { IdSchema } from './common.js';

export const CategorySchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
});

export const CategoryListResponseSchema = z.object({
  items: z.array(CategorySchema),
});

export type Category = z.infer<typeof CategorySchema>;
export type CategoryListResponse = z.infer<typeof CategoryListResponseSchema>;
