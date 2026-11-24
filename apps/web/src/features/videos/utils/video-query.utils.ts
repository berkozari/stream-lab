import { VideoListQuerySchema } from '@streamlab/contracts';
import type { VideoListFilters } from '../types/video.types.ts';

/** Normalize with the same Zod contract used by the API; don't duplicate limits. */
export function normalizeVideoFilters(filters: VideoListFilters = {}) {
  return VideoListQuerySchema.parse(filters);
}

export function videoListSearch(filters: VideoListFilters = {}): string {
  const parsed = normalizeVideoFilters(filters);
  const params = new URLSearchParams();
  if (parsed.q !== undefined) params.set('q', parsed.q);
  if (parsed.category !== undefined) params.set('category', parsed.category);
  params.set('limit', String(parsed.limit));
  if (parsed.cursor !== undefined) params.set('cursor', parsed.cursor);
  return `?${params.toString()}`;
}
