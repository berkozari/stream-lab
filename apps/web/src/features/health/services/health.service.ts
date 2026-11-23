import type { HealthResponse } from '@streamlab/contracts';
import { apiClient } from '@/services/api/api-client';

export const healthService = {
  getLiveness(signal?: AbortSignal): Promise<HealthResponse> {
    return apiClient.get<HealthResponse>('/health', { signal });
  },
};
