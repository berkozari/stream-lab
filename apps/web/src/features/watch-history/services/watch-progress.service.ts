import { axiosInstance } from '@/lib/axios';
import { createWatchProgressClient } from './watch-progress-client';

/** Reuse authenticated in-memory JWT interceptors; never persist watch activity locally. */
export const watchProgressService = createWatchProgressClient(axiosInstance);
