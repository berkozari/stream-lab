import assert from 'node:assert/strict';
import test from 'node:test';
import { safeReturnTo, singleFlight } from '../src/features/auth/utils/auth.utils.ts';

test('safeReturnTo accepts same-origin paths only', () => {
  assert.equal(safeReturnTo('/creator?tab=videos'), '/creator?tab=videos');
  for (const bad of [null, 'https://evil.invalid', '//evil.invalid', '/\\evil.invalid', '']) {
    assert.equal(safeReturnTo(bad), '/creator');
  }
});

test('singleFlight shares concurrent work and permits a new flight afterward', async () => {
  let calls = 0;
  let complete: ((value: string) => void) | undefined;
  const run = singleFlight(() => {
    calls++;
    return new Promise<string>((resolve) => {
      complete = resolve;
    });
  });
  const first = run();
  const second = run();
  assert.strictEqual(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.ok(complete);
  complete('token-a');
  assert.equal(await first, 'token-a');
  assert.equal(await second, 'token-a');
  const third = run();
  await Promise.resolve();
  assert.equal(calls, 2);
  assert.ok(complete);
  complete('token-b');
  assert.equal(await third, 'token-b');
});
