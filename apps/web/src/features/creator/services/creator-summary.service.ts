import { axiosInstance } from '@/lib/axios';
import { createCreatorSummaryClient } from './creator-summary-client';

export const creatorSummaryService = createCreatorSummaryClient(axiosInstance);
