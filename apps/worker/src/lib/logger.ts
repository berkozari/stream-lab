import pino from 'pino';
import { workerEnv } from '../config/env.js';

/** Emit structured worker events without serializing job payloads or signed URLs. */
export const workerLogger = pino({
  name: 'streamlab-worker',
  level: workerEnv.logLevel,
  redact: {
    paths: [
      'token',
      'refreshToken',
      'password',
      'passwordHash',
      'playbackToken',
      '*.token',
      '*.password',
      '*.refreshToken',
      '*.playbackToken',
    ],
    censor: '[REDACTED]',
  },
});

/** Do not forward arbitrary error.message; it can contain signed playback URLs or credentials. */
export function errorClass(error: unknown): string {
  if (error instanceof Error) {
    return /^[A-Za-z][A-Za-z0-9]{0,50}$/.test(error.name) ? error.name : 'Error';
  }
  return 'UnknownError';
}
