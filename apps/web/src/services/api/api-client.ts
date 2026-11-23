import type { AxiosRequestConfig } from 'axios';
import { axiosInstance } from '@/lib/axios';

export const apiClient = {
  async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await axiosInstance.get<T>(path, config);
    return response.data;
  },
};
