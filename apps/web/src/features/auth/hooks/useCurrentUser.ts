import { useQuery } from '@tanstack/react-query';
import { authService } from '../services/auth.service';
import { useAuth } from './useAuth';

export function useCurrentUser() {
  const { status, user } = useAuth();
  return useQuery({
    queryKey: ['auth', 'me', user?.id],
    queryFn: ({ signal }) => authService.currentUser(signal),
    enabled: status === 'authenticated',
    retry: false,
  });
}
