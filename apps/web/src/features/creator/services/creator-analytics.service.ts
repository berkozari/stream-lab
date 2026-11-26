/** STREAM-008.5: Creator analytics aggregation/dashboard. */
import { axiosInstance } from '@/lib/axios';
import { createCreatorAnalyticsClient } from './creator-analytics-client';

export const creatorAnalyticsService = createCreatorAnalyticsClient(axiosInstance);
