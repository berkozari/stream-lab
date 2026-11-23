import { Router } from 'express';
import type { HealthResponse } from '@streamlab/contracts';
import { checkReadiness, type ReadinessReport } from '../lib/readiness.js';

export function createHealthRouter(
  readiness: () => Promise<ReadinessReport> = checkReadiness,
): Router {
  const router = Router();

  // Liveness: HTTP process is up. Must not depend on PostgreSQL or Redis.
  router.get('/', (_req, res) => {
    const response: HealthResponse = {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  });

  // Readiness: can the API reach its required dependencies?
  router.get('/ready', async (_req, res) => {
    const report = await readiness();
    res.status(report.status === 'ready' ? 200 : 503).json(report);
  });

  return router;
}

export const healthRouter = createHealthRouter();
