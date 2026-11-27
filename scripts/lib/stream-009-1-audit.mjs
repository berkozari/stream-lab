import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const REQUIRED_EVIDENCE = Object.freeze({
  'API security': [
    'apps/api/src/app.ts',
    'apps/api/src/middlewares/auth.middleware.ts',
    'apps/api/src/middlewares/csrf.middleware.ts',
    'apps/api/src/routes/auth.routes.ts',
  ],
  'Upload integrity': [
    'apps/api/src/lib/upload-content.ts',
    'apps/api/src/services/upload-verify-storage.service.ts',
  ],
  'Playback security': [
    'apps/api/src/lib/playback-capability.ts',
    'apps/api/src/services/playback-hls.service.ts',
  ],
  'Worker recovery': [
    'apps/api/src/services/video-transcode-recovery.service.ts',
    'apps/worker/src/processors/video-transcode.processor.ts',
  ],
  'Analytics data': [
    'apps/api/src/repositories/playback-analytics.repository.ts',
    'apps/api/prisma/schema.prisma',
  ],
  Observability: [
    'apps/api/src/middlewares/request-logger.middleware.ts',
    'apps/api/src/lib/readiness.ts',
  ],
  Testing: [
    'apps/api/tests/integration/creator-analytics.http.test.mjs',
    'apps/worker/tests/unit/video-transcode-processor.test.ts',
    'apps/web/tests/e2e/creator-analytics.spec.ts',
  ],
  'Audit documentation': [
    'docs/stream-009.1-production-hardening-audit.md',
    'STREAM-009.1-README.md',
  ],
});

export function inspectEvidence(root, evidence = REQUIRED_EVIDENCE) {
  return Object.entries(evidence).map(([area, names]) => ({
    area,
    missing: names.filter((name) => !existsSync(path.join(root, name))),
  }));
}

export function inspectSampleSecrets(exampleText) {
  const keys = [
    'AUTH_ACCESS_TOKEN_SECRET',
    'AUTH_REFRESH_TOKEN_HMAC_SECRET',
    'AUTH_CSRF_SECRET',
    'PLAYBACK_SIGNING_SECRET',
  ];
  const matches = new Map();
  for (const line of exampleText.split(/\r?\n/u)) {
    const match = /^([A-Z_]+)=(.*)$/u.exec(line.trim());
    if (match && keys.includes(match[1])) matches.set(match[1], match[2]);
  }
  return keys.filter((key) => {
    const value = matches.get(key);
    return (
      value !== undefined &&
      value !== '' &&
      !/^(?:<.+>|\$\{.+\}|CHANGE_ME.*|REPLACE_ME.*|GENERATE_ME.*|YOUR_.*)$/iu.test(value)
    );
  });
}

export function hasRepoCi(root) {
  const directory = path.join(root, '.github/workflows');
  return (
    existsSync(directory) &&
    readdirSync(directory, { withFileTypes: true }).some(
      (entry) => entry.isFile() && /\.ya?ml$/iu.test(entry.name),
    )
  );
}

export function inspectRepo(root) {
  const evidence = inspectEvidence(root);
  const example = path.join(root, '.env.example');
  const concreteExampleKeys = existsSync(example)
    ? inspectSampleSecrets(readFileSync(example, 'utf8'))
    : [];
  return {
    evidence,
    ready: evidence.filter((item) => item.missing.length === 0).length,
    missing: evidence.flatMap((item) => item.missing),
    concreteExampleKeys,
    ciWorkflowPresent: hasRepoCi(root),
  };
}
