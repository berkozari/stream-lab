import axios, { type InternalAxiosRequestConfig } from 'axios';
import { axiosInstance } from '@/lib/axios';
import { authService } from './auth.service';
import { getAccessToken } from './auth-state';

type RetryConfig = InternalAxiosRequestConfig & { _streamlabRetried?: boolean };

function isAuthRequest(url?: string): boolean {
  return url === '/auth' || url?.startsWith('/auth/') === true;
}

// Installed once when the auth bootstrap component is imported.
axiosInstance.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && !isAuthRequest(config.url)) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

axiosInstance.interceptors.response.use(undefined, async (error: unknown) => {
  if (!axios.isAxiosError(error) || error.response?.status !== 401) {
    return Promise.reject(error);
  }
  const request = error.config as RetryConfig | undefined;
  // Only retry safe reads: mutation requests require explicit user action.
  if (
    !request ||
    request._streamlabRetried ||
    isAuthRequest(request.url) ||
    !['get', 'head'].includes(request.method?.toLowerCase() ?? '')
  )
    return Promise.reject(error);

  const bearer = request.headers?.get('Authorization');
  const sentToken =
    typeof bearer === 'string' && bearer.startsWith('Bearer ') ? bearer.slice(7) : null;
  if (!sentToken) return Promise.reject(error);

  request._streamlabRetried = true;
  try {
    // If another request already refreshed the token, reuse it without rotating again.
    const current = getAccessToken();
    if (!current || current === sentToken) await authService.refresh();
    if (!getAccessToken()) return Promise.reject(error);
    return axiosInstance.request(request);
  } catch {
    return Promise.reject(error);
  }
});
