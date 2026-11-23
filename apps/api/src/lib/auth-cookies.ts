import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { REFRESH_COOKIE_TTL_MS, newCsrfContext, csrfTokenForContext } from './auth-security.js';

const path = '/api/v1/auth';
const refreshName = 'streamlab_refresh';
const csrfName = 'streamlab_csrf_context';

const commonCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path,
};

export function getCookie(req: Request, name: string): string | undefined {
  const entry = (req.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!entry) return undefined;
  const value = entry.slice(name.length + 1);
  // All tokens issued by StreamLab are base64url ASCII, so no decoding is needed.
  return /^[A-Za-z0-9_-]{20,200}$/.test(value) ? value : undefined;
}

export function readCsrfContext(req: Request): string | undefined {
  return getCookie(req, csrfName);
}

export function issueCsrfContext(res: Response): string {
  const context = newCsrfContext();
  res.cookie(csrfName, context, { ...commonCookieOptions, maxAge: REFRESH_COOKIE_TTL_MS });
  return csrfTokenForContext(context);
}

export function writeRefreshCookie(res: Response, token: string): void {
  res.cookie(refreshName, token, { ...commonCookieOptions, maxAge: REFRESH_COOKIE_TTL_MS });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(refreshName, commonCookieOptions);
}
