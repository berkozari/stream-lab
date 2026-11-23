const origin = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000';

const live = await fetch(`${origin}/api/v1/health`);
if (!live.ok || (await live.json()).status !== 'ok') {
  throw new Error('Liveness failed');
}
console.log('PASS: liveness');

const ready = await fetch(`${origin}/api/v1/health/ready`);
const report = await ready.json();
if (!ready.ok || report.status !== 'ready') {
  console.error(report);
  throw new Error('Readiness failed: PostgreSQL/Redis may be unavailable');
}
console.log('PASS: readiness (PostgreSQL + Redis)');
