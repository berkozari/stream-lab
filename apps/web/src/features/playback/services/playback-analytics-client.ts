import {
  IdSchema,
  PlaybackAnalyticsAckSchema,
  PlaybackAnalyticsEventSchema,
  type PlaybackAnalyticsAck,
  type PlaybackAnalyticsEvent,
} from '@streamlab/contracts';

type Success<T> = { success: true; data: T };
export type PlaybackAnalyticsHttpClient = {
  post<T>(path: string, body: unknown): Promise<{ data: T }>;
};

export function createPlaybackAnalyticsClient(http: PlaybackAnalyticsHttpClient) {
  return {
    async report(videoId: string, event: PlaybackAnalyticsEvent): Promise<PlaybackAnalyticsAck> {
      const id = IdSchema.parse(videoId);
      const body = PlaybackAnalyticsEventSchema.parse(event);
      // Signed capability travels ONLY in the POST body, never in a URL or persistent storage.
      const response = await http.post<Success<PlaybackAnalyticsAck>>(
        `/videos/${id}/analytics/events`,
        body,
      );
      return PlaybackAnalyticsAckSchema.parse(response.data.data);
    },
  };
}
