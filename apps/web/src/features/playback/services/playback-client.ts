import { IdSchema, PlaybackResponseSchema, type PlaybackResponse } from '@streamlab/contracts';

/** Small structural HTTP surface, allowing the playback contract to be tested without Axios. */
export type PlaybackHttpClient = {
  get<T>(path: string, config?: { signal?: AbortSignal }): Promise<{ data: T }>;
};

type Success<T> = { success: true; data: T };

export function createPlaybackClient(http: PlaybackHttpClient) {
  return {
    async getPlayback(videoId: string, signal?: AbortSignal): Promise<PlaybackResponse> {
      const id = IdSchema.parse(videoId);
      const { data } = await http.get<Success<PlaybackResponse>>(`/videos/${id}/playback`, {
        signal,
      });
      return PlaybackResponseSchema.parse(data.data);
    },
  };
}
