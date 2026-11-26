import { useCallback, useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { watchProgressService } from '../services/watch-progress.service';
import { createProgressReporter, type WatchProgressSample } from '../utils/progress-reporting';
import type { WatchListMode } from '../services/watch-progress-client';

const progressKey = (userId: string, videoId: string) =>
  ['watch-progress', userId, videoId] as const;
const listKey = (userId: string, mode: WatchListMode) => ['watch-history', userId, mode] as const;

/** Anonymous users can watch public videos; only authenticated users save progress. */
export function useWatchProgress(videoId: string | undefined, ready: boolean) {
  const { status, user } = useAuth();
  const userId = user?.id;
  const enabled = status === 'authenticated' && Boolean(userId && videoId) && ready;
  const queryClient = useQueryClient();
  const [saveFailed, setSaveFailed] = useState(false);
  const saved = useQuery({
    queryKey: progressKey(userId ?? 'anonymous', videoId ?? 'missing'),
    enabled,
    retry: false,
    queryFn: ({ signal }) => watchProgressService.read(videoId!, signal),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  // Create the reporter inside the effect so React StrictMode cleanup/re-mount
  // creates a fresh queue instead of permanently closing a memoized queue.
  const reporterRef = useRef<ReturnType<typeof createProgressReporter> | null>(null);
  useEffect(() => {
    if (!enabled || !videoId || !userId) return;
    const reporter = createProgressReporter(async (sample) => {
      await watchProgressService.save(videoId, sample);
      void queryClient.invalidateQueries({ queryKey: ['watch-history', userId] });
    }, setSaveFailed);
    reporterRef.current = reporter;
    return () => {
      reporter.close();
      if (reporterRef.current === reporter) reporterRef.current = null;
    };
  }, [enabled, queryClient, userId, videoId]);

  const report = useCallback(
    (sample: WatchProgressSample, force: boolean) => reporterRef.current?.report(sample, force),
    [],
  );

  return {
    isLoadingProgress: enabled && saved.isPending,
    readFailed: enabled && saved.isError,
    saveFailed: enabled && saveFailed,
    resumeSeconds: saved.data && !saved.data.completedAt ? saved.data.positionSeconds : 0,
    report: enabled ? report : undefined,
  };
}

export function useWatchList(mode: WatchListMode) {
  const { status, user } = useAuth();
  const userId = user?.id;
  return useInfiniteQuery({
    queryKey: listKey(userId ?? 'anonymous', mode),
    enabled: status === 'authenticated' && Boolean(userId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => watchProgressService.list(mode, pageParam, signal),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
