import type { RequestHandler } from 'express';
import {
  getCookie,
  issueCsrfContext,
  writeRefreshCookie,
  clearRefreshCookie,
} from '../lib/auth-cookies.js';
import { refreshSession, type RefreshHandler } from '../services/refresh.service.js';
import { AppError } from '../utils/app-error.js';
import { sendSuccess } from '../utils/api-response.js';

export function createRefreshController(refresh: RefreshHandler = refreshSession): RequestHandler {
  return async (req, res) => {
    const token = getCookie(req, 'streamlab_refresh');
    if (!token) {
      clearRefreshCookie(res);
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired session');
    }
    try {
      const result = await refresh(token);
      writeRefreshCookie(res, result.refreshToken);
      // The browser must bootstrap a new CSRF token after refresh.
      issueCsrfContext(res);
      res.set('Cache-Control', 'no-store');
      sendSuccess(res, result.response);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 401) {
        clearRefreshCookie(res);
      }
      throw error;
    }
  };
}
