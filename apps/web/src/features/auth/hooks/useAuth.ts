import { useSyncExternalStore } from 'react';
import { getAuthSnapshot, subscribeAuth } from '../services/auth-state';

export function useAuth() {
  return useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);
}
