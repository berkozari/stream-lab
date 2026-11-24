import './env.js'; // Load root .env lazily, without booting S3 at API startup.

export type StorageConfig = {
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  uploadBucket: string;
  mediaBucket: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
};

const bucketPattern = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u;

/** Explicit credentials are optional in production to support the SDK provider chain. */
export function readStorageConfig(source: NodeJS.ProcessEnv = process.env): StorageConfig {
  const production = source.NODE_ENV === 'production';
  const rawEndpoint = source.S3_ENDPOINT ?? (production ? '' : 'http://127.0.0.1:9000');
  let endpoint: URL;
  try {
    endpoint = new URL(rawEndpoint);
  } catch {
    throw new Error('S3_ENDPOINT must be an absolute HTTP(S) URL');
  }
  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    !endpoint.hostname ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== '/'
  ) {
    throw new Error(
      'S3_ENDPOINT must be a bare HTTP(S) endpoint without credentials, path or query',
    );
  }
  if (production && endpoint.protocol !== 'https:') {
    throw new Error('Production S3_ENDPOINT must use HTTPS');
  }
  const forcePathStyle = source.S3_FORCE_PATH_STYLE ?? 'true';
  if (forcePathStyle !== 'true' && forcePathStyle !== 'false') {
    throw new Error('S3_FORCE_PATH_STYLE must be true or false');
  }
  const uploadBucket = source.S3_UPLOAD_BUCKET ?? 'streamlab-uploads';
  const mediaBucket = source.S3_MEDIA_BUCKET ?? 'streamlab-media';
  if (
    !bucketPattern.test(uploadBucket) ||
    !bucketPattern.test(mediaBucket) ||
    uploadBucket === mediaBucket
  ) {
    throw new Error('Upload and media bucket names must be distinct valid S3 bucket names');
  }
  // Local SILO uses the already-configured development root identity. Do not use it in production.
  const hasExplicitCredentials = Boolean(source.S3_ACCESS_KEY_ID || source.S3_SECRET_ACCESS_KEY);
  const accessKeyId = hasExplicitCredentials
    ? source.S3_ACCESS_KEY_ID
    : !production
      ? source.S3_ROOT_USER
      : undefined;
  const secretAccessKey = hasExplicitCredentials
    ? source.S3_SECRET_ACCESS_KEY
    : !production
      ? source.S3_ROOT_PASSWORD
      : undefined;
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error('S3 access key ID and secret must be provided together');
  }
  if (!production && (!accessKeyId || !secretAccessKey)) {
    throw new Error(
      'Local storage credentials missing: set S3_ROOT_USER and S3_ROOT_PASSWORD in .env',
    );
  }
  return {
    endpoint: endpoint.origin,
    region: source.S3_REGION || 'us-east-1',
    forcePathStyle: forcePathStyle === 'true',
    uploadBucket,
    mediaBucket,
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  };
}
