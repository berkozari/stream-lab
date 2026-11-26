/** First publication is an explicit creator action, never an automatic transcode side-effect. */
export type PublicationState = { status: string; publishedAt: Date | null };
export type PublicationVisibility = 'PRIVATE' | 'PUBLIC' | 'UNLISTED' | undefined;

export function planVideoPublication(
  existing: PublicationState,
  requestedVisibility: PublicationVisibility,
  now: () => Date = () => new Date(),
): { exposing: boolean; allowed: boolean; publishedAt?: Date } {
  const exposing = requestedVisibility === 'PUBLIC' || requestedVisibility === 'UNLISTED';
  const allowed = !exposing || existing.status === 'READY';
  if (exposing && allowed && existing.publishedAt === null) {
    return { exposing, allowed, publishedAt: now() };
  }
  return { exposing, allowed };
}
