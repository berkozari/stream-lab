import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve('.env');
if (!existsSync(path)) {
  throw new Error('Root .env not found. Create it from .env.example, then rerun.');
}
let contents = readFileSync(path, 'utf8');
const keys = [
  'AUTH_ACCESS_TOKEN_SECRET',
  'AUTH_REFRESH_TOKEN_HMAC_SECRET',
  'AUTH_CSRF_SECRET',
  'PLAYBACK_SIGNING_SECRET',
];
let created = 0;
for (const key of keys) {
  const pattern = new RegExp(`^${key}=(.*)$`, 'm');
  const existing = contents.match(pattern);
  if (existing && existing[1].trim().length > 0) continue;
  const secret = randomBytes(32).toString(key === 'PLAYBACK_SIGNING_SECRET' ? 'hex' : 'base64url');
  if (existing) contents = contents.replace(pattern, `${key}=${secret}`);
  else contents += `${contents.endsWith('\n') ? '' : '\n'}${key}=${secret}\n`;
  created += 1;
}
writeFileSync(path, contents, { mode: 0o600 });
chmodSync(path, 0o600);
console.log(`Auth/playback secrets ready (${created} newly generated). Values are never printed.`);
