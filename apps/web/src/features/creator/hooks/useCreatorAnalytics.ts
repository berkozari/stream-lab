/** STREAM-008.5: Creator analytics aggregation/dashboard. */
import { useQuery } from '@tanstack/react-query';
import type { CreatorAnalyticsRange } from '@streamlab/contracts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { creatorAnalyticsService } from '../services/creator-analytics.service';

export const creatorAnalyticsKeys = {
  all: ['creator-analytics'] as const,
  user: (userId: string, range: CreatorAnalyticsRange) =>
    [...creatorAnalyticsKeys.all, userId, range] as const,
};

export function useCreatorAnalytics(range: CreatorAnalyticsRange) {
  const { user, status } = useAuth();
  return useQuery({
    queryKey: creatorAnalyticsKeys.user(user?.id ?? 'anonymous', range),
    enabled: status === 'authenticated' && Boolean(user?.id),
    queryFn: ({ signal }) => creatorAnalyticsService.read(range, signal),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
