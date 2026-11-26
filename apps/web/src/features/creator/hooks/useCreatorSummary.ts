import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { creatorSummaryService } from '../services/creator-summary.service';

export const creatorSummaryKeys = {
  all: ['creator-summary'] as const,
  user: (userId: string) => [...creatorSummaryKeys.all, userId] as const,
};

export function useCreatorSummary() {
  const { status, user } = useAuth();
  return useQuery({
    queryKey: creatorSummaryKeys.user(user?.id ?? 'anonymous'),
    enabled: status === 'authenticated' && Boolean(user?.id),
    queryFn: ({ signal }) => creatorSummaryService.read(signal),
    staleTime: 30_000,
    // Transcoding updates occur asynchronously outside the creator's mutations.
    refetchInterval: 30_000,
  });
}
