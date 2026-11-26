import { axiosInstance } from '@/lib/axios';
import { createPlaybackAnalyticsClient } from './playback-analytics-client';

export const playbackAnalyticsService = createPlaybackAnalyticsClient(axiosInstance);
