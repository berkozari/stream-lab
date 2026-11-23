import { z } from 'zod';
import './env.js'; // Ensure the existing root .env loader has run.

const authSecretsSchema = z.object({
  AUTH_ACCESS_TOKEN_SECRET: z.string().min(32),
  AUTH_REFRESH_TOKEN_HMAC_SECRET: z.string().min(32),
  AUTH_CSRF_SECRET: z.string().min(32),
});

/** Read lazily so /health and existing isolated tests do not need auth secrets. */
export function getAuthSecrets() {
  const result = authSecretsSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error('Missing auth secrets. Run pnpm setup:auth:secrets (do not commit .env).');
  }
  if (new Set(Object.values(result.data)).size !== 3) {
    throw new Error('Auth secrets must use three independent random values.');
  }
  return result.data;
}
