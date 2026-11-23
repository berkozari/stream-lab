import type { AuthSessionResponse, AuthUser } from '@streamlab/contracts';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';
export type AuthSnapshot = Readonly<{ status: AuthStatus; user: AuthUser | null }>;

const listeners = new Set<() => void>();
let token: string | null = null;
let snapshot: AuthSnapshot = { status: 'loading', user: null };

function publish(next: AuthSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}

/** Access JWT is memory-only; do not persist it in browser storage. */
export function getAccessToken(): string | null {
  return token;
}

export function setAuthenticated(session: AuthSessionResponse): void {
  token = session.accessToken;
  publish({ status: 'authenticated', user: session.user });
}

export function setAnonymous(): void {
  token = null;
  publish({ status: 'anonymous', user: null });
}

export function setBootstrapError(): void {
  token = null;
  publish({ status: 'error', user: null });
}
