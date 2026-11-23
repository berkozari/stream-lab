import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { z } from 'zod';
import { validateBody } from '../../src/middlewares/validate.middleware.js';
import { errorMiddleware } from '../../src/middlewares/error.middleware.js';
import { requestIdMiddleware } from '../../src/middlewares/request-id.middleware.js';

const app = express();
app.use(requestIdMiddleware);
app.use(express.json());
app.post('/validate', validateBody(z.object({ title: z.string().min(3) })), (req, res) => {
  res.json({ title: (req.body as { title: string }).title });
});
app.use(errorMiddleware);

test('invalid body is rejected with 422', async () => {
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x' }),
    });
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(response.status, 422);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
