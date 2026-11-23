import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthSessionResponse } from '@streamlab/contracts';
import {
  getAccessToken,
  getAuthSnapshot,
  setAnonymous,
  setAuthenticated,
  subscribeAuth,
} from '../src/features/auth/services/auth-state.ts';

const fixture: AuthSessionResponse = {
  accessToken: 'only-in-memory',
  tokenType: 'Bearer',
  expiresInSeconds: 600,
  user: {
    id: '90af8cd8-ef0f-4e15-b967-fbccaa23dc4a',
    email: 'person@example.invalid',
    displayName: 'Test User',
    role: 'USER',
    avatarUrl: null,
    createdAt: '2026-11-23T00:00:00.000Z',
  },
};

test('auth snapshot follows login/logout and notifies subscribers', () => {
  let changes = 0;
  const unsubscribe = subscribeAuth(() => {
    changes++;
  });
  setAuthenticated(fixture);
  assert.equal(getAuthSnapshot().status, 'authenticated');
  assert.equal(getAuthSnapshot().user?.id, fixture.user.id);
  assert.equal(getAccessToken(), 'only-in-memory');
  setAnonymous();
  assert.equal(getAuthSnapshot().status, 'anonymous');
  assert.equal(getAccessToken(), null);
  assert.equal(changes, 2);
  unsubscribe();
});
