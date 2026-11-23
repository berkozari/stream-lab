/** Prevent protocol-relative / external redirect injection after login. */
export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/creator';
  }
  if (/[\r\n]/.test(value)) return '/creator';
  return value;
}

/** Deduplicate concurrent refresh calls. The next call after settlement starts a new flight. */
export function singleFlight<T>(action: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (!pending) {
      pending = Promise.resolve()
        .then(action)
        .finally(() => {
          pending = null;
        });
    }
    return pending;
  };
}
