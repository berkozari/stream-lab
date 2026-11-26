/** STREAM-008.6: Owner-scoped, selected-video analytics. */
import { useQuery } from '@tanstack/react-query';
import type { CreatorAnalyticsRange } from '@streamlab/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { creatorVideoAnalyticsService } from '../services/creator-video-analytics.service';

export function useCreatorVideoAnalytics(videoId: string, range: CreatorAnalyticsRange) {
  const { user, status } = useAuth();
  return useQuery({
    queryKey: ['creator-video-analytics', user?.id ?? 'anonymous', videoId, range],
    enabled: status === 'authenticated' && Boolean(user?.id) && Boolean(videoId),
    queryFn: ({ signal }) => creatorVideoAnalyticsService.read(videoId, range, signal),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
