import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Fail before a port is opened or any worker queue job is consumed.
// Report field names only. Never include credentials, tokens, or full URLs in output.
const forbiddenExamples = [/change[_-]?me/iu, /ephemeral[_-]?only/iu, /example[_-]?secret/iu];

function isStrongSecret(value) {
  return (
    typeof value === 'string' &&
    Buffer.byteLength(value, 'utf8') >= 32 &&
    !forbiddenExamples.some((pattern) => pattern.test(value))
  );
}

function origin(value, { https = true } = {}) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      (!https || url.protocol === 'https:') &&
      (https || ['http:', 'https:'].includes(url.protocol)) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function database(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      ['postgresql:', 'postgres:'].includes(url.protocol) &&
      Boolean(url.hostname && url.username && url.password && url.pathname.length > 1) &&
      !forbiddenExamples.some((pattern) => pattern.test(decodeURIComponent(url.password)))
    );
  } catch {
    return false;
  }
}

function redis(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'rediss:' &&
      Boolean(url.hostname && url.password) &&
      !forbiddenExamples.some((pattern) => pattern.test(decodeURIComponent(url.password)))
    );
  } catch {
    return false;
  }
}

export function validateProductionEnv(env) {
  const errors = [];
  const requireField = (field, valid) => {
    if (!valid) errors.push(field);
  };

  requireField('NODE_ENV', env.NODE_ENV === 'production');
  requireField('RATE_LIMIT_STORE', env.RATE_LIMIT_STORE === 'redis');
  requireField('DATABASE_URL', database(env.DATABASE_URL));
  requireField('REDIS_URL', redis(env.REDIS_URL));
  const secrets = [
    'AUTH_ACCESS_TOKEN_SECRET',
    'AUTH_REFRESH_TOKEN_HMAC_SECRET',
    'AUTH_CSRF_SECRET',
    'PLAYBACK_SIGNING_SECRET',
  ];
  for (const name of secrets) requireField(name, isStrongSecret(env[name]));
  const set = new Set(secrets.map((name) => env[name]));
  requireField('INDEPENDENT_SECRETS', set.size === secrets.length);

  requireField(
    'CORS_ORIGINS',
    typeof env.CORS_ORIGINS === 'string' &&
      env.CORS_ORIGINS.length > 0 &&
      env.CORS_ORIGINS.split(',').every((item) => origin(item.trim())),
  );
  requireField('PLAYBACK_PUBLIC_BASE_URL', origin(env.PLAYBACK_PUBLIC_BASE_URL));
  requireField('PLAYBACK_S3_PUBLIC_ENDPOINT', origin(env.PLAYBACK_S3_PUBLIC_ENDPOINT));
  requireField('S3_ENDPOINT', origin(env.S3_ENDPOINT));
  requireField(
    'S3_UPLOAD_BUCKET',
    /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(env.S3_UPLOAD_BUCKET ?? ''),
  );
  requireField(
    'S3_MEDIA_BUCKET',
    /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(env.S3_MEDIA_BUCKET ?? '') &&
      env.S3_MEDIA_BUCKET !== env.S3_UPLOAD_BUCKET,
  );
  requireField(
    'S3_CREDENTIAL_PAIR',
    Boolean(env.S3_ACCESS_KEY_ID) === Boolean(env.S3_SECRET_ACCESS_KEY),
  );
  requireField('NO_DEVELOPMENT_ROOT_KEYS', !env.S3_ROOT_USER && !env.S3_ROOT_PASSWORD);

  if (env.TRUST_PROXY_CIDRS) {
    // The API has the authoritative IP/CIDR parser; catch obvious unsafe shorthand early.
    requireField(
      'TRUST_PROXY_CIDRS',
      !env.TRUST_PROXY_CIDRS.split(',').some((entry) =>
        ['0.0.0.0/0', '::/0', '*', 'true'].includes(entry.trim()),
      ),
    );
  }
  return errors;
}

function main() {
  const errors = validateProductionEnv(process.env);
  if (errors.length) {
    for (const field of errors) process.stderr.write(`[STREAM-009.7] FAIL: ${field}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('[STREAM-009.7] PASS: production environment preflight\n');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
