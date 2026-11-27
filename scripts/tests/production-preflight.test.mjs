import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { validateProductionEnv } from '../production/preflight.mjs';

function safeEnv() {
  return {
    NODE_ENV: 'production',
    RATE_LIMIT_STORE: 'redis',
    DATABASE_URL:
      'postgresql://service:safe_private_password@db.internal:5432/streamlab?sslmode=require',
    REDIS_URL: 'rediss://service:safe_private_password@redis.internal:6380',
    AUTH_ACCESS_TOKEN_SECRET: 'a'.repeat(48),
    AUTH_REFRESH_TOKEN_HMAC_SECRET: 'b'.repeat(48),
    AUTH_CSRF_SECRET: 'c'.repeat(48),
    PLAYBACK_SIGNING_SECRET: 'd'.repeat(48),
    CORS_ORIGINS: 'https://video.example.org,https://app.example.org',
    PLAYBACK_PUBLIC_BASE_URL: 'https://video.example.org',
    PLAYBACK_S3_PUBLIC_ENDPOINT: 'https://cdn.example.org',
    S3_ENDPOINT: 'https://objects.example.org',
    S3_UPLOAD_BUCKET: 'streamlab-uploads',
    S3_MEDIA_BUCKET: 'streamlab-media',
  };
}

test('accepts dedicated production secrets, TLS endpoints and distinct buckets', () => {
  assert.deepEqual(validateProductionEnv(safeEnv()), []);
});

test('rejects development mode and non-shared rate limiting', () => {
  const env = { ...safeEnv(), NODE_ENV: 'development', RATE_LIMIT_STORE: 'memory' };
  assert.deepEqual(validateProductionEnv(env), ['NODE_ENV', 'RATE_LIMIT_STORE']);
});

test('rejects missing, weak or repeated auth and playback secrets', () => {
  const env = { ...safeEnv(), PLAYBACK_SIGNING_SECRET: 'short', AUTH_CSRF_SECRET: 'a'.repeat(48) };
  const errors = validateProductionEnv(env);
  assert.ok(errors.includes('PLAYBACK_SIGNING_SECRET'));
  assert.ok(errors.includes('INDEPENDENT_SECRETS'));
});

test('rejects example credentials in DATABASE_URL without exposing them', () => {
  const env = { ...safeEnv(), DATABASE_URL: 'postgresql://app:ci_ephemeral_only@db.internal/x' };
  assert.ok(validateProductionEnv(env).includes('DATABASE_URL'));
});

test('rejects plaintext Redis and unauthenticated rediss endpoints', () => {
  assert.ok(
    validateProductionEnv({ ...safeEnv(), REDIS_URL: 'redis://example.org:6379' }).includes(
      'REDIS_URL',
    ),
  );
  assert.ok(
    validateProductionEnv({ ...safeEnv(), REDIS_URL: 'rediss://example.org:6380' }).includes(
      'REDIS_URL',
    ),
  );
});

test('rejects HTTP CORS, insecure playback origins, and wildcard domains', () => {
  const env = {
    ...safeEnv(),
    CORS_ORIGINS: 'https://video.example.org,*',
    PLAYBACK_PUBLIC_BASE_URL: 'http://video.example.org',
  };
  const errors = validateProductionEnv(env);
  assert.ok(errors.includes('CORS_ORIGINS'));
  assert.ok(errors.includes('PLAYBACK_PUBLIC_BASE_URL'));
});

test('rejects duplicate buckets and root development object storage credentials', () => {
  const env = { ...safeEnv(), S3_MEDIA_BUCKET: 'streamlab-uploads', S3_ROOT_USER: 'streamlab' };
  const errors = validateProductionEnv(env);
  assert.ok(errors.includes('S3_MEDIA_BUCKET'));
  assert.ok(errors.includes('NO_DEVELOPMENT_ROOT_KEYS'));
});

test('allows IAM credentials and rejects incomplete explicit S3 credentials', () => {
  assert.deepEqual(
    validateProductionEnv({ ...safeEnv(), S3_ACCESS_KEY_ID: '', S3_SECRET_ACCESS_KEY: '' }),
    [],
  );
  assert.ok(
    validateProductionEnv({ ...safeEnv(), S3_ACCESS_KEY_ID: 'id' }).includes('S3_CREDENTIAL_PAIR'),
  );
});

test('rejects unbounded trusted proxy CIDRs', () => {
  assert.ok(
    validateProductionEnv({ ...safeEnv(), TRUST_PROXY_CIDRS: '0.0.0.0/0' }).includes(
      'TRUST_PROXY_CIDRS',
    ),
  );
});

test('CLI reports only field names, never values of invalid secrets', () => {
  const target = fileURLToPath(new URL('../production/preflight.mjs', import.meta.url));
  const secret = 'TOP_SECRET_NOT_FOR_LOGGING';
  const result = spawnSync(process.execPath, [target], {
    env: { ...safeEnv(), PLAYBACK_SIGNING_SECRET: secret },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('PLAYBACK_SIGNING_SECRET'));
  assert.ok(!(result.stderr + result.stdout).includes(secret));
});

test('CLI passes with valid configuration', () => {
  const target = fileURLToPath(new URL('../production/preflight.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [target], { env: safeEnv(), encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /PASS: production environment preflight/u);
});
