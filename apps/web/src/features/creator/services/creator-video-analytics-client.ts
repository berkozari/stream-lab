/** STREAM-008.6: Schema-validated per-video analytics client. */
import {
  CreatorVideoAnalyticsResponseSchema,
  type CreatorAnalyticsRange,
  type CreatorVideoAnalyticsResponse,
} from '@streamlab/contracts';
import type { CreatorAnalyticsHttp } from './creator-analytics-client';

type Success<T> = { success: true; data: T };
export function createCreatorVideoAnalyticsClient(http: CreatorAnalyticsHttp) {
  return {
    async read(
      videoId: string,
      range: CreatorAnalyticsRange,
      signal?: AbortSignal,
    ): Promise<CreatorVideoAnalyticsResponse> {
      const path = `/creator/videos/${encodeURIComponent(videoId)}/analytics?range=${encodeURIComponent(range)}`;
      const { data } = await http.get<Success<CreatorVideoAnalyticsResponse>>(path, { signal });
      return CreatorVideoAnalyticsResponseSchema.parse(data.data);
    },
  };
}
