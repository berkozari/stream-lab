import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { videoService } from '../services/video.service';
import { videoKeys } from './video.keys';
import type { VideoListFilters } from '../types/video.types';
import { videoStatusRefetchInterval } from '../utils/video-status-polling';

type PageFilters = Omit<VideoListFilters, 'cursor'>;

/** Public discovery is readable without authentication. */
export function usePublicVideos(filters: PageFilters = {}) {
  return useInfiniteQuery({
    queryKey: videoKeys.publicPages(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      videoService.listPublic({ ...filters, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/** Query keys are scoped by user ID; auth mutations also clear the whole QueryClient. */
export function useMyVideos(filters: PageFilters = {}) {
  const { status, user } = useAuth();
  const userId = user?.id;
  return useInfiniteQuery({
    queryKey: videoKeys.minePages(userId ?? 'anonymous', filters),
    enabled: status === 'authenticated' && Boolean(userId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      videoService.listMine({ ...filters, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/** Owners can read private drafts; anonymous viewers see only public/unlisted-ready detail. */
export function useVideoDetail(videoId?: string) {
  return useQuery({
    queryKey: videoKeys.detail(videoId ?? 'missing'),
    enabled: Boolean(videoId),
    queryFn: ({ signal }) =>
      videoId
        ? videoService.detail(videoId, signal)
        : Promise.reject(new Error('Missing video ID')),
    retry: false,
    refetchInterval: (query) => videoStatusRefetchInterval(query.state.data?.status),
  });
}
