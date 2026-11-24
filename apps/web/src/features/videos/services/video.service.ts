import { axiosInstance } from '@/lib/axios';
import { createVideoClient } from './video-client';

/** Uses the existing memory-only JWT interceptor and safe-read single-flight refresh. */
export const videoService = createVideoClient(axiosInstance);
