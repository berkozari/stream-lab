import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';
import { SignJWT } from 'jose';
import { getAuthSecrets } from '../config/auth-env.js';

export const ACCESS_TOKEN_TTL_SECONDS = 600;
export const REFRESH_COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeEmail(email: string): string {
  // Do not remove dots or '+' tags: those are provider-specific and can change identity.
  return email.trim().toLowerCase();
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function digestRefreshToken(token: string): string {
  return createHmac('sha256', getAuthSecrets().AUTH_REFRESH_TOKEN_HMAC_SECRET)
    .update(token)
    .digest('hex');
}

export async function signAccessToken(userId: string, sessionId: string): Promise<string> {
  const secret = getAuthSecrets().AUTH_ACCESS_TOKEN_SECRET;
  return new SignJWT({ sid: sessionId, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer('streamlab-api')
    .setAudience('streamlab-web')
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));
}

export function newCsrfContext(): string {
  return randomBytes(32).toString('base64url');
}

export function csrfTokenForContext(context: string): string {
  return createHmac('sha256', getAuthSecrets().AUTH_CSRF_SECRET)
    .update(`streamlab:csrf:anonymous:${context}`)
    .digest('base64url');
}

export function equalCsrfToken(context: string, presented: string): boolean {
  const expected = Buffer.from(csrfTokenForContext(context), 'utf8');
  const actual = Buffer.from(presented, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
