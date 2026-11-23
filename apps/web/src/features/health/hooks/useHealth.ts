import { useQuery } from '@tanstack/react-query';
import { healthKeys } from './health.keys';
import { healthService } from '../services/health.service';

export function useHealth() {
  return useQuery({
    queryKey: healthKeys.liveness(),
    queryFn: ({ signal }) => healthService.getLiveness(signal),
    retry: 1,
    refetchInterval: 20_000,
  });
}
