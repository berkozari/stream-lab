import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.js';

export const UserRoleSchema = z.enum(['USER', 'ADMIN']);
export const AuthUserSchema = z.object({
  id: IdSchema,
  displayName: z.string().min(1).max(100),
  email: z.email(),
  role: UserRoleSchema,
  avatarUrl: z.url().nullable(),
  createdAt: IsoDateTimeSchema,
});

export const RegisterRequestSchema = z.object({
  email: z.email().max(255),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(1).max(100),
});
export const LoginRequestSchema = z.object({
  email: z.email().max(255),
  password: z.string().min(1).max(128),
});
export const AuthSessionResponseSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresInSeconds: z.number().int().positive(),
  user: AuthUserSchema,
});

export type AuthUser = z.infer<typeof AuthUserSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;
