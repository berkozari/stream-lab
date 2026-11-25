import { S3Client } from '@aws-sdk/client-s3';
import './env.js';

export type WorkerStorageConfig = {
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  mediaBucket: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
};

/** Media-only worker credentials; no access to the browser staging bucket is needed. */
export function readWorkerStorageConfig(env: NodeJS.ProcessEnv = process.env): WorkerStorageConfig {
  const production = env.NODE_ENV === 'production';
  const rawEndpoint = env.S3_ENDPOINT ?? (production ? '' : 'http://127.0.0.1:9000');
  let url: URL;
  try {
    url = new URL(rawEndpoint);
  } catch {
    throw new Error('Invalid S3_ENDPOINT');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.pathname !== '/' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('S3_ENDPOINT must be a bare HTTP(S) origin');
  }
  if (production && url.protocol !== 'https:')
    throw new Error('Production S3_ENDPOINT must use HTTPS');
  const rawPathStyle = env.S3_FORCE_PATH_STYLE ?? 'true';
  if (!['true', 'false'].includes(rawPathStyle)) throw new Error('Invalid S3_FORCE_PATH_STYLE');
  const mediaBucket = env.S3_MEDIA_BUCKET ?? 'streamlab-media';
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(mediaBucket))
    throw new Error('Invalid S3_MEDIA_BUCKET');
  const explicitCredentials = Boolean(env.S3_ACCESS_KEY_ID || env.S3_SECRET_ACCESS_KEY);
  const accessKeyId = explicitCredentials
    ? env.S3_ACCESS_KEY_ID
    : !production
      ? env.S3_ROOT_USER
      : undefined;
  const secretAccessKey = explicitCredentials
    ? env.S3_SECRET_ACCESS_KEY
    : !production
      ? env.S3_ROOT_PASSWORD
      : undefined;
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey))
    throw new Error('Incomplete S3 credentials');
  if (!production && !accessKeyId) throw new Error('Local S3 credentials required');
  return {
    endpoint: url.origin,
    region: env.S3_REGION ?? 'us-east-1',
    forcePathStyle: rawPathStyle === 'true',
    mediaBucket,
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  };
}

export function createWorkerStorageClient(
  config: WorkerStorageConfig = readWorkerStorageConfig(),
): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    ...(config.credentials ? { credentials: config.credentials } : {}),
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}
