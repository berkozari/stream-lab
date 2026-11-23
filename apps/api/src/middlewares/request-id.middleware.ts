import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

// Never trust caller-supplied request IDs as the sole log correlation identifier.
export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const id = randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};
