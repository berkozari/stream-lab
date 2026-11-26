import { useQuery } from '@tanstack/react-query';
import { listPublicCategories } from '../services/category-client';

export const categoryKeys = { all: ['categories', 'public'] as const };

export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.all,
    queryFn: ({ signal }) => listPublicCategories(signal),
    staleTime: 5 * 60_000,
  });
}
