import { axiosInstance } from '@/lib/axios';
import { createVideoUploadClient } from './video-upload-client';

/** STREAM-004.8 will connect this client to the Creator upload UI. */
export const videoUploadService = createVideoUploadClient(axiosInstance);
