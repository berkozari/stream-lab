import type { RequestHandler } from 'express';
import { clearRefreshCookie, getCookie, issueCsrfContext } from '../lib/auth-cookies.js';
import { logoutSession, type LogoutHandler } from '../services/session.service.js';

export function createLogoutController(logout: LogoutHandler = logoutSession): RequestHandler {
  return async (req, res) => {
    await logout(getCookie(req, 'streamlab_refresh'));
    clearRefreshCookie(res);
    issueCsrfContext(res);
    res.set('Cache-Control', 'no-store');
    res.status(204).end();
  };
}
