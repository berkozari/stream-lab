import { useEffect } from 'react';
import { bootstrapAuth } from '../services/auth.service';
// Install axios interceptors exactly once per module load.
import '../services/auth-interceptors';

export function AuthBootstrap() {
  useEffect(() => {
    void bootstrapAuth();
  }, []);
  return null;
}
