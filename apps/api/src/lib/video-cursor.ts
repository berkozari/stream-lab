import { AppError } from '../utils/app-error.js';

export type VideoPageScope = 'public' | `mine:${string}`;
export type VideoCursorContext = { scope: VideoPageScope; q?: string; category?: string };
export type VideoCursorPosition = { createdAt: Date; id: string };

const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu;
const invalidCursor = () => new AppError(422, 'INVALID_CURSOR', 'Invalid pagination cursor');

export function encodeVideoCursor(
  position: VideoCursorPosition,
  context: VideoCursorContext,
): string {
  return Buffer.from(
    JSON.stringify({ v: 1, t: position.createdAt.toISOString(), id: position.id, ...context }),
  ).toString('base64url');
}

/** Cursors are opaque pagination positions, not authentication or authorization tokens. */
export function decodeVideoCursor(
  value: string | undefined,
  context: VideoCursorContext,
): VideoCursorPosition | undefined {
  if (value === undefined) return undefined;
  try {
    if (value.length > 512 || !/^[\w-]+$/u.test(value)) throw invalidCursor();
    const raw: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw invalidCursor();
    const data = raw as Record<string, unknown>;
    if (
      data.v !== 1 ||
      data.scope !== context.scope ||
      data.q !== context.q ||
      data.category !== context.category ||
      typeof data.t !== 'string' ||
      typeof data.id !== 'string' ||
      !uuidPattern.test(data.id)
    )
      throw invalidCursor();
    const createdAt = new Date(data.t);
    if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== data.t)
      throw invalidCursor();
    return { createdAt, id: data.id };
  } catch {
    throw invalidCursor();
  }
}
