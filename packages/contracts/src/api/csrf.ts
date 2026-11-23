import { z } from 'zod';

export const CsrfTokenResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ csrfToken: z.string().min(32) }),
});

export type CsrfTokenResponse = z.infer<typeof CsrfTokenResponseSchema>;
