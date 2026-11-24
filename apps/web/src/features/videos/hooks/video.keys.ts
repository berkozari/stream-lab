import { normalizeVideoFilters } from '../utils/video-query.utils.ts';
import type { VideoListFilters } from '../types/video.types.ts';

function pageFilters(filters: VideoListFilters): VideoListFilters {
  // The cursor belongs to the current page, never the identity of the entire infinite query.
  const { cursor: _cursor, ...rest } = filters;
  void _cursor;
  return normalizeVideoFilters(rest);
}

export const videoKeys = {
  all: ['videos'] as const,
  lists: () => [...videoKeys.all, 'lists'] as const,
  publicPages: (filters: VideoListFilters = {}) =>
    [...videoKeys.lists(), 'public', pageFilters(filters)] as const,
  minePages: (userId: string, filters: VideoListFilters = {}) =>
    [...videoKeys.lists(), 'mine', userId, pageFilters(filters)] as const,
  details: () => [...videoKeys.all, 'details'] as const,
  detail: (videoId: string) => [...videoKeys.details(), videoId] as const,
};
