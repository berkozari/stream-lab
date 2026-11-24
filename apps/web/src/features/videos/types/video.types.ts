import type { VideoListResponseSchema } from '@streamlab/contracts';

/** Backend cursor pagination; cursor is scoped to the exact query and viewer. */
export type VideoListFilters = {
  q?: string;
  category?: string;
  limit?: number;
  cursor?: string;
};

/** Use the shared response contract rather than redefining its DTO. */
export type VideoPage = ReturnType<typeof VideoListResponseSchema.parse>;
export type DeleteVideoResult = { status: 'DELETING' };
