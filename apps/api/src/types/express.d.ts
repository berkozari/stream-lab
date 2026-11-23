import type { AuthPrincipal } from './auth.js';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: AuthPrincipal;
    }
  }
}

export {};
