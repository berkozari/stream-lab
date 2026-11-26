import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateVideoRequest, UpdateVideoRequest } from '@streamlab/contracts';
import { videoService } from '../services/video.service';
import { videoKeys } from './video.keys';
import { creatorSummaryKeys } from '@/features/creator/hooks/useCreatorSummary';

export function useCreateVideo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateVideoRequest) => videoService.create(payload),
    onSuccess: async (video) => {
      client.setQueryData(videoKeys.detail(video.id), video);
      await Promise.all([
        client.invalidateQueries({ queryKey: videoKeys.lists() }),
        client.invalidateQueries({ queryKey: creatorSummaryKeys.all }),
      ]);
    },
  });
}

export function useUpdateVideo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ videoId, data }: { videoId: string; data: UpdateVideoRequest }) =>
      videoService.update(videoId, data),
    onSuccess: async (video) => {
      client.setQueryData(videoKeys.detail(video.id), video);
      await Promise.all([
        client.invalidateQueries({ queryKey: videoKeys.lists() }),
        client.invalidateQueries({ queryKey: creatorSummaryKeys.all }),
      ]);
    },
  });
}

export function useDeleteVideo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (videoId: string) => videoService.remove(videoId),
    onSuccess: async (_result, videoId) => {
      await client.cancelQueries({ queryKey: videoKeys.detail(videoId), exact: true });
      client.removeQueries({ queryKey: videoKeys.detail(videoId), exact: true });
      await Promise.all([
        client.invalidateQueries({ queryKey: videoKeys.lists() }),
        client.invalidateQueries({ queryKey: creatorSummaryKeys.all }),
      ]);
    },
  });
}
