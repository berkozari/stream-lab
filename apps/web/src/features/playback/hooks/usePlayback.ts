import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { playbackService } from '../services/playback.service';
import { playbackRefreshDue, playbackRefreshInterval } from '../utils/playback-renewal';

/** The manifest URL contains a short-lived capability; never persist it in browser storage. */
export function usePlayback(videoId?: string, ready = true) {
  const { status, user } = useAuth();
  const isResolved = status === 'authenticated' || status === 'anonymous';
  return useQuery({
    queryKey: ['playback', videoId ?? 'missing', user?.id ?? 'anonymous'],
    enabled: Boolean(videoId) && ready && isResolved,
    queryFn: ({ signal }) => {
      if (!videoId) return Promise.reject(new Error('Missing video ID'));
      return playbackService.getPlayback(videoId, signal);
    },
    retry: false,
    refetchOnWindowFocus: (query) => playbackRefreshDue(query.state.data?.expiresAt),
    refetchOnReconnect: (query) => playbackRefreshDue(query.state.data?.expiresAt),
    refetchInterval: (query) => playbackRefreshInterval(query.state.data?.expiresAt),
    refetchIntervalInBackground: false,
    staleTime: 0,
    gcTime: 0,
  });
}
