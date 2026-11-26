import test from 'node:test';
import assert from 'node:assert/strict';
import { nextPlaybackSessionState } from '../../src/lib/playback-analytics-rules.ts';

const origin = new Date('2026-11-26T12:00:00.000Z');
const make = (overrides: Record<string, unknown> = {}) => ({
  lastSequence: 0,
  watchedSeconds: 0,
  lastEventAt: origin,
  startedAt: origin,
  qualifiedAt: null,
  completedAt: null,
  ...overrides,
});

test('a qualified view requires actual reported play time, not a page load', () => {
  const first = nextPlaybackSessionState(
    make(),
    {
      sequence: 1,
      kind: 'HEARTBEAT',
      playedSeconds: 5,
    },
    new Date(origin.getTime() + 5_000),
  );
  assert.equal(first.increment, 5);
  assert.equal(first.watchedSeconds, 5);
  assert.equal(first.qualifiedAt?.toISOString(), '2026-11-26T12:00:05.000Z');
});

test('replayed or reordered sequences do not add watched seconds', () => {
  const state = make({ lastSequence: 4, watchedSeconds: 12 });
  assert.deepEqual(
    nextPlaybackSessionState(
      state,
      {
        sequence: 4,
        kind: 'HEARTBEAT',
        playedSeconds: 25,
      },
      new Date(origin.getTime() + 30_000),
    ),
    {
      ignored: true,
      increment: 0,
      watchedSeconds: 12,
      qualifiedAt: null,
      completedAt: null,
    },
  );
});

test('server elapsed time bounds a forged client-reported delta', () => {
  const result = nextPlaybackSessionState(
    make(),
    {
      sequence: 1,
      kind: 'HEARTBEAT',
      playedSeconds: 30,
    },
    new Date(origin.getTime() + 1_000),
  );
  assert.equal(result.increment, 1);
  assert.equal(result.qualifiedAt, null);
});

test('multiple fast events cannot qualify a view without elapsed wall time', () => {
  const current = make({ lastSequence: 2, watchedSeconds: 0 });
  const next = nextPlaybackSessionState(
    current,
    { sequence: 3, kind: 'HEARTBEAT', playedSeconds: 30 },
    origin,
  );
  assert.equal(next.increment, 0);
  assert.equal(next.qualifiedAt, null);
});

test('seeking, starting and paused time without play delta do not count views', () => {
  for (const kind of ['START', 'SEEK'] as const) {
    const result = nextPlaybackSessionState(
      make(),
      {
        sequence: 1,
        kind,
        playedSeconds: 30,
      },
      new Date(origin.getTime() + 60_000),
    );
    assert.equal(result.increment, 0);
  }
  const paused = nextPlaybackSessionState(
    make(),
    {
      sequence: 1,
      kind: 'PAUSE',
      playedSeconds: 0,
    },
    new Date(origin.getTime() + 60_000),
  );
  assert.equal(paused.increment, 0);
});

test('completion requires an end event and a previously qualified session', () => {
  const unqualified = nextPlaybackSessionState(
    make(),
    {
      sequence: 1,
      kind: 'ENDED',
      playedSeconds: 0,
    },
    new Date(origin.getTime() + 10_000),
  );
  assert.equal(unqualified.completedAt, null);
  const qualified = nextPlaybackSessionState(
    make({ watchedSeconds: 7, qualifiedAt: origin }),
    {
      sequence: 1,
      kind: 'ENDED',
      playedSeconds: 0,
    },
    new Date(origin.getTime() + 10_000),
  );
  assert.ok(qualified.completedAt);
});

test('reported playback time is capped per session', () => {
  const result = nextPlaybackSessionState(
    make({ watchedSeconds: 86_399, startedAt: new Date(origin.getTime() - 86_400_000) }),
    {
      sequence: 1,
      kind: 'HEARTBEAT',
      playedSeconds: 30,
    },
    new Date(origin.getTime() + 30_000),
  );
  assert.equal(result.increment, 1);
  assert.equal(result.watchedSeconds, 86_400);
});
