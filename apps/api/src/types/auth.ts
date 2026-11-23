import type { AuthUser } from '@streamlab/contracts';

/** Server-resolved identity, not claims trusted directly from a JWT. */
export type AuthPrincipal = {
  userId: string;
  sessionId: string;
  user: AuthUser;
};
