import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '../services/auth.service';

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: authService.login,
    onSuccess: () => client.clear(),
  });
}

export function useRegister() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: authService.register,
    onSuccess: () => client.clear(),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: authService.logout,
    onSuccess: () => client.clear(),
  });
}
