import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateVideoRequest, UpdateVideoRequest } from '@streamlab/contracts';
import { videoService } from '../services/video.service';
import { videoKeys } from './video.keys';

export function useCreateVideo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateVideoRequest) => videoService.create(payload),
    onSuccess: async (video) => {
      client.setQueryData(videoKeys.detail(video.id), video);
      await client.invalidateQueries({ queryKey: videoKeys.lists() });
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
      await client.invalidateQueries({ queryKey: videoKeys.lists() });
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
      await client.invalidateQueries({ queryKey: videoKeys.lists() });
    },
  });
}
