/** Bounded read-only local API health sampler. Deliberately not a load generator. */
import { performance } from 'node:perf_hooks';

const OPTION_LIMITS = {
  '--requests': [1, 200],
  '--concurrency': [1, 8],
  '--timeout-ms': [100, 5_000],
  '--p95-ms': [1, 10_000],
  '--max-errors': [0, 200],
};

export function parseHealthProbeArgs(args) {
  const config = {
    url: 'http://127.0.0.1:4000/api/v1/health',
    requests: 40,
    concurrency: 2,
    timeoutMs: 1_500,
    maxErrors: 0,
  };
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!key || !value || seen.has(key) || (key !== '--url' && !(key in OPTION_LIMITS))) {
      throw new Error(`Invalid, missing or repeated option: ${key ?? '(empty)'}`);
    }
    seen.add(key);
    if (key === '--url') {
      config.url = value;
      continue;
    }
    const [min, max] = OPTION_LIMITS[key];
    if (!/^\d+$/.test(value)) throw new Error(`${key} must be a decimal integer`);
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < min || number > max) {
      throw new Error(`${key} must be between ${min} and ${max}`);
    }
    const field = {
      '--requests': 'requests',
      '--concurrency': 'concurrency',
      '--timeout-ms': 'timeoutMs',
      '--p95-ms': 'p95Ms',
      '--max-errors': 'maxErrors',
    }[key];
    config[field] = number;
  }
  if (config.maxErrors > config.requests) throw new Error('--max-errors cannot exceed requests');
  validateHealthUrl(config.url);
  return config;
}

export function validateHealthUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Health URL is invalid');
  }
  const allowedHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  if (
    url.protocol !== 'http:' ||
    !allowedHosts.has(url.hostname) ||
    url.pathname !== '/api/v1/health' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error('Only a local HTTP /api/v1/health URL without credentials or query is allowed');
  }
  return url;
}

export function nearestRankPercentile(values, percentile) {
  if (!values.length || !(percentile > 0 && percentile <= 100)) {
    throw new RangeError('Percentile requires nonempty data and a value in (0,100]');
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)];
}

/** Exactly N GET requests, at most concurrency in-flight. Never follows redirects. */
export async function sampleHealthEndpoint(config, request = fetch) {
  validateHealthUrl(config.url);
  if (
    !Number.isSafeInteger(config.requests) ||
    config.requests < 1 ||
    config.requests > 200 ||
    !Number.isSafeInteger(config.concurrency) ||
    config.concurrency < 1 ||
    config.concurrency > 8 ||
    !Number.isSafeInteger(config.timeoutMs) ||
    config.timeoutMs < 100 ||
    config.timeoutMs > 5_000 ||
    !Number.isSafeInteger(config.maxErrors) ||
    config.maxErrors < 0 ||
    config.maxErrors > config.requests ||
    (config.p95Ms !== undefined &&
      (!Number.isSafeInteger(config.p95Ms) || config.p95Ms < 1 || config.p95Ms > 10_000))
  ) {
    throw new RangeError('Invalid probe limits');
  }
  let issued = 0;
  let errors = 0;
  let successes = 0;
  const latencies = [];
  const started = performance.now();
  async function worker() {
    while (issued < config.requests) {
      issued += 1;
      const begin = performance.now();
      try {
        const response = await request(config.url, {
          method: 'GET',
          redirect: 'manual',
          cache: 'no-store',
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(config.timeoutMs),
        });
        const json = await response.json();
        if (response.status !== 200 || json?.status !== 'ok' || json?.service !== 'api') {
          errors += 1;
        } else {
          successes += 1;
          latencies.push(performance.now() - begin);
        }
      } catch {
        errors += 1;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(config.requests, config.concurrency) }, () => worker()),
  );
  const elapsedMs = performance.now() - started;
  const p50Ms = latencies.length ? nearestRankPercentile(latencies, 50) : null;
  const p95Ms = latencies.length ? nearestRankPercentile(latencies, 95) : null;
  return {
    sent: issued,
    successes,
    errors,
    elapsedMs,
    p50Ms,
    p95Ms,
    passed:
      errors <= config.maxErrors &&
      (config.p95Ms === undefined || (p95Ms !== null && p95Ms <= config.p95Ms)),
  };
}
