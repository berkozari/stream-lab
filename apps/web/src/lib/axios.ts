import axios from 'axios';

// Relative URL uses the existing Vite /api proxy in local development.
// In production, VITE_API_BASE_URL can be set to an absolute /api/v1 endpoint.
export const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 8_000,
  withCredentials: true,
  headers: { Accept: 'application/json' },
});
