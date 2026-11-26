import {
  IdSchema,
  UpdateWatchProgressRequestSchema,
  WatchHistoryResponseSchema,
  WatchProgressResponseSchema,
  type WatchHistoryResponse,
  type WatchProgressResponse,
} from '@streamlab/contracts';
import type { WatchProgressSample } from '../utils/progress-reporting';

type Success<T> = { success: true; data: T };
export type ProgressHttpClient = {
  get<T>(path: string, config?: { signal?: AbortSignal }): Promise<{ data: T }>;
  put<T>(path: string, body: unknown): Promise<{ data: T }>;
};

export type WatchListMode = 'history' | 'continue';
export function createWatchProgressClient(http: ProgressHttpClient) {
  return {
    async read(videoId: string, signal?: AbortSignal): Promise<WatchProgressResponse | null> {
      const id = IdSchema.parse(videoId);
      const response = await http.get<Success<WatchProgressResponse | null>>(
        `/users/me/watch-progress/${id}`,
        { signal },
      );
      return response.data.data === null
        ? null
        : WatchProgressResponseSchema.parse(response.data.data);
    },
    async save(videoId: string, value: WatchProgressSample): Promise<WatchProgressResponse> {
      const id = IdSchema.parse(videoId);
      const body = UpdateWatchProgressRequestSchema.parse(value);
      const response = await http.put<Success<WatchProgressResponse>>(
        `/users/me/watch-progress/${id}`,
        body,
      );
      return WatchProgressResponseSchema.parse(response.data.data);
    },
    async list(
      mode: WatchListMode,
      cursor: string | null,
      signal?: AbortSignal,
    ): Promise<WatchHistoryResponse> {
      const params = new URLSearchParams({ limit: '20' });
      if (cursor) params.set('cursor', cursor);
      const path = mode === 'continue' ? 'continue-watching' : 'watch-history';
      const response = await http.get<Success<WatchHistoryResponse>>(
        `/users/me/${path}?${params.toString()}`,
        { signal },
      );
      return WatchHistoryResponseSchema.parse(response.data.data);
    },
  };
}
