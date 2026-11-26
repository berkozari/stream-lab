import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SESSION_WATCH_SECONDS,
  nextPlaybackSessionState,
  type SessionState,
  type PlaybackSample,
} from '../../src/lib/playback-analytics-rules.ts';

const base = new Date('2026-11-26T12:00:00.000Z');
const at = (seconds: number) => new Date(base.getTime() + seconds * 1_000);

function session(overrides: Partial<SessionState> = {}): SessionState {
  return {
    lastSequence: 0,
    watchedSeconds: 0,
    lastEventAt: base,
    startedAt: base,
    qualifiedAt: null,
    completedAt: null,
    ...overrides,
  };
}
function sample(
  sequence: number,
  kind: PlaybackSample['kind'],
  playedSeconds: number,
): PlaybackSample {
  return { sequence, kind, playedSeconds };
}

test('the first two seconds do not qualify a view; the third does', () => {
  const first = nextPlaybackSessionState(session(), sample(1, 'HEARTBEAT', 2), at(2));
  assert.equal(first.watchedSeconds, 2);
  assert.equal(first.qualifiedAt, null);
  const second = nextPlaybackSessionState(
    session({ lastSequence: 1, watchedSeconds: 2, lastEventAt: at(2) }),
    sample(2, 'HEARTBEAT', 1),
    at(3),
  );
  assert.equal(second.watchedSeconds, 3);
  assert.equal(second.qualifiedAt?.toISOString(), at(3).toISOString());
});

test('replaying or reordering an already accepted sequence cannot add watch time', () => {
  const previous = session({ lastSequence: 8, watchedSeconds: 16, qualifiedAt: at(3) });
  for (const sequence of [7, 8]) {
    const result = nextPlaybackSessionState(previous, sample(sequence, 'HEARTBEAT', 30), at(60));
    assert.equal(result.ignored, true);
    assert.equal(result.increment, 0);
    assert.equal(result.watchedSeconds, 16);
  }
});

test('START and SEEK never add client-reported skipped time', () => {
  for (const kind of ['START', 'SEEK'] as const) {
    const result = nextPlaybackSessionState(session(), sample(1, kind, 30), at(30));
    assert.equal(result.increment, 0);
    assert.equal(result.watchedSeconds, 0);
  }
});

test('PAUSE counts only actually reported played time, not idle wall time', () => {
  const paused = nextPlaybackSessionState(session(), sample(1, 'PAUSE', 0), at(30));
  assert.equal(paused.increment, 0);
  const withPlayback = nextPlaybackSessionState(session(), sample(1, 'PAUSE', 4), at(30));
  assert.equal(withPlayback.increment, 4);
});

test('forged 30-second heartbeat is bounded by elapsed server time', () => {
  const result = nextPlaybackSessionState(session(), sample(1, 'HEARTBEAT', 30), at(1));
  assert.equal(result.increment, 1);
  assert.equal(result.qualifiedAt, null);
});

test('clock regression and same-timestamp bursts cannot create watched seconds', () => {
  for (const now of [at(-10), base]) {
    const result = nextPlaybackSessionState(session(), sample(1, 'HEARTBEAT', 30), now);
    assert.equal(result.increment, 0);
    assert.equal(result.qualifiedAt, null);
  }
});

test('cumulative time cannot exceed server elapsed time since session started', () => {
  const result = nextPlaybackSessionState(
    session({ lastSequence: 4, watchedSeconds: 5, lastEventAt: at(3) }),
    sample(5, 'HEARTBEAT', 30),
    at(6),
  );
  assert.equal(result.increment, 1);
  assert.equal(result.watchedSeconds, 6);
});

test('an unqualified ENDED event does not produce a completed view', () => {
  const result = nextPlaybackSessionState(session(), sample(1, 'ENDED', 0), at(10));
  assert.equal(result.completedAt, null);
  assert.equal(result.qualifiedAt, null);
});

test('an existing completedAt timestamp survives later heartbeats', () => {
  const doneAt = at(20);
  const result = nextPlaybackSessionState(
    session({
      watchedSeconds: 12,
      qualifiedAt: at(3),
      completedAt: doneAt,
      lastEventAt: at(20),
    }),
    sample(1, 'HEARTBEAT', 2),
    at(22),
  );
  assert.equal(result.completedAt, doneAt);
  assert.equal(result.qualifiedAt?.toISOString(), at(3).toISOString());
});

test('session total is bounded even after a huge elapsed wall clock interval', () => {
  const result = nextPlaybackSessionState(
    session({ watchedSeconds: MAX_SESSION_WATCH_SECONDS - 1, lastEventAt: at(1) }),
    sample(1, 'HEARTBEAT', 30),
    at(MAX_SESSION_WATCH_SECONDS + 100),
  );
  assert.equal(result.increment, 1);
  assert.equal(result.watchedSeconds, MAX_SESSION_WATCH_SECONDS);
});
