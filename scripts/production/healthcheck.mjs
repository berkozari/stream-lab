// Docker API readiness check; no third-party packages or credentials required.
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5_000);
try {
  const result = await fetch('http://127.0.0.1:4000/api/v1/health/ready', {
    signal: controller.signal,
    redirect: 'error',
  });
  if (result.status !== 200) throw new Error('not ready');
  const body = await result.json();
  if (body.status !== 'ready') throw new Error('not ready');
} catch {
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
