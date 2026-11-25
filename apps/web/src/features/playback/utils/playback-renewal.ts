/** Refresh signed playback links before their expiry without polling every few seconds. */
export const PLAYBACK_REFRESH_LEAD_MS = 120_000;
const MIN_RETRY_DELAY_MS = 10_000;

export function playbackRefreshInterval(
  expiresAt: string | undefined,
  now = Date.now(),
): number | false {
  if (!expiresAt) return false;
  const deadline = Date.parse(expiresAt);
  if (!Number.isFinite(deadline)) return false;
  const remaining = deadline - now;
  if (remaining <= 0) return MIN_RETRY_DELAY_MS;
  if (remaining < MIN_RETRY_DELAY_MS) return Math.max(1_000, Math.floor(remaining / 2));
  // For unusually short TTLs, don't schedule after the token has expired.
  const lead = Math.min(PLAYBACK_REFRESH_LEAD_MS, Math.floor(remaining / 4));
  return Math.max(MIN_RETRY_DELAY_MS, remaining - lead);
}

/** A background tab can miss the interval; revalidate once it becomes visible again. */
export function playbackRefreshDue(expiresAt: string | undefined, now = Date.now()): boolean {
  if (!expiresAt) return true;
  const deadline = Date.parse(expiresAt);
  return !Number.isFinite(deadline) || deadline - now <= PLAYBACK_REFRESH_LEAD_MS;
}
