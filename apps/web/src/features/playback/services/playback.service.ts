import { axiosInstance } from '@/lib/axios';
import { createPlaybackClient } from './playback-client';

/** Inherits the memory-only access token and safe GET refresh from the shared Axios instance. */
export const playbackService = createPlaybackClient(axiosInstance);
