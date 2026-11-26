/** STREAM-008.6: Creator analytics detail API. */
import { axiosInstance } from '@/lib/axios';
import { createCreatorVideoAnalyticsClient } from './creator-video-analytics-client';
export const creatorVideoAnalyticsService = createCreatorVideoAnalyticsClient(axiosInstance);
