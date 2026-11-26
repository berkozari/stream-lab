import { CreatorSummaryResponseSchema, type CreatorSummaryResponse } from '@streamlab/contracts';

type Success<T> = { success: true; data: T };
export type CreatorSummaryHttp = {
  get<T>(path: string, config?: { signal?: AbortSignal }): Promise<{ data: T }>;
};

export function createCreatorSummaryClient(http: CreatorSummaryHttp) {
  return {
    async read(signal?: AbortSignal): Promise<CreatorSummaryResponse> {
      const { data } = await http.get<Success<CreatorSummaryResponse>>('/creator/summary', {
        signal,
      });
      return CreatorSummaryResponseSchema.parse(data.data);
    },
  };
}
