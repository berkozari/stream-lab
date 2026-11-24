import {
  CreateVideoRequestSchema,
  IdSchema,
  UpdateVideoRequestSchema,
  VideoListResponseSchema,
  VideoResponseSchema,
  type CreateVideoRequest,
  type UpdateVideoRequest,
} from '@streamlab/contracts';
import { videoListSearch } from '../utils/video-query.utils.ts';
import type { DeleteVideoResult, VideoListFilters } from '../types/video.types.ts';

/** Small structural interface implemented by the existing Axios instance. */
export type VideoHttpClient = {
  get<T>(path: string, config?: { signal?: AbortSignal }): Promise<{ data: T }>;
  post<T>(path: string, body?: unknown): Promise<{ data: T }>;
  patch<T>(path: string, body?: unknown): Promise<{ data: T }>;
  delete<T>(path: string): Promise<{ data: T }>;
};

type Success<T> = { success: true; data: T };
type VideoResponse = ReturnType<typeof VideoResponseSchema.parse>;
type VideoListResponse = ReturnType<typeof VideoListResponseSchema.parse>;

/** Dependency-injected for HTTP tests; production supplies the shared authenticated Axios instance. */
export function createVideoClient(http: VideoHttpClient) {
  return {
    async listPublic(
      filters: VideoListFilters = {},
      signal?: AbortSignal,
    ): Promise<VideoListResponse> {
      const { data } = await http.get<Success<VideoListResponse>>(
        `/videos${videoListSearch(filters)}`,
        { signal },
      );
      return VideoListResponseSchema.parse(data.data);
    },
    async listMine(
      filters: VideoListFilters = {},
      signal?: AbortSignal,
    ): Promise<VideoListResponse> {
      const { data } = await http.get<Success<VideoListResponse>>(
        `/videos/mine${videoListSearch(filters)}`,
        { signal },
      );
      return VideoListResponseSchema.parse(data.data);
    },
    async detail(videoId: string, signal?: AbortSignal): Promise<VideoResponse> {
      const id = IdSchema.parse(videoId);
      const { data } = await http.get<Success<VideoResponse>>(`/videos/${id}`, { signal });
      return VideoResponseSchema.parse(data.data);
    },
    async create(payload: CreateVideoRequest): Promise<VideoResponse> {
      const validated = CreateVideoRequestSchema.parse(payload);
      const { data } = await http.post<Success<VideoResponse>>('/videos', validated);
      return VideoResponseSchema.parse(data.data);
    },
    async update(videoId: string, payload: UpdateVideoRequest): Promise<VideoResponse> {
      const id = IdSchema.parse(videoId);
      const validated = UpdateVideoRequestSchema.parse(payload);
      const { data } = await http.patch<Success<VideoResponse>>(`/videos/${id}`, validated);
      return VideoResponseSchema.parse(data.data);
    },
    async remove(videoId: string): Promise<DeleteVideoResult> {
      const id = IdSchema.parse(videoId);
      const { data } = await http.delete<Success<DeleteVideoResult>>(`/videos/${id}`);
      if (data.data.status !== 'DELETING') {
        throw new Error('Unexpected video deletion status');
      }
      return data.data;
    },
  };
}
