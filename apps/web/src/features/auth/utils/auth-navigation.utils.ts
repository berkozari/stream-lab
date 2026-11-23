import { safeReturnTo } from './auth.utils.ts';

const DEFAULT_AFTER_AUTH = '/creator';
const BASE = 'https://streamlab.invalid';

/** The login/register pages must not redirect authenticated users back to auth forms. */
export function authReturnTo(value: string | null): string {
  const path = safeReturnTo(value);
  try {
    const parsed = new URL(path, BASE);
    if (parsed.origin !== BASE || /^\/(?:login|register)(?:\/|$)/u.test(parsed.pathname)) {
      return DEFAULT_AFTER_AUTH;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_AFTER_AUTH;
  }
}

export function authPageLink(mode: 'login' | 'register', returnTo: string): string {
  const destination = `/${mode}`;
  const safeDestination = authReturnTo(returnTo);
  return safeDestination === DEFAULT_AFTER_AUTH
    ? destination
    : `${destination}?returnTo=${encodeURIComponent(safeDestination)}`;
}

export function protectedLoginLink(pathname: string, search: string): string {
  return authPageLink('login', `${pathname}${search}`);
}
