/** STREAM-008.5: Creator analytics aggregation/dashboard. */
import {
  CreatorAnalyticsResponseSchema,
  type CreatorAnalyticsRange,
  type CreatorAnalyticsResponse,
} from '@streamlab/contracts';

type Success<T> = { success: true; data: T };
export type CreatorAnalyticsHttp = {
  get<T>(path: string, config?: { signal?: AbortSignal }): Promise<{ data: T }>;
};
export function createCreatorAnalyticsClient(http: CreatorAnalyticsHttp) {
  return {
    async read(
      range: CreatorAnalyticsRange,
      signal?: AbortSignal,
    ): Promise<CreatorAnalyticsResponse> {
      const { data } = await http.get<Success<CreatorAnalyticsResponse>>(
        `/creator/analytics?range=${encodeURIComponent(range)}`,
        { signal },
      );
      return CreatorAnalyticsResponseSchema.parse(data.data);
    },
  };
}
