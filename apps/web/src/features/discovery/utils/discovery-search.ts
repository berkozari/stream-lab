/** Normalize public filter parameters before passing them into the shared video query schema. */
export function readDiscoveryFilters(params: URLSearchParams) {
  const term = params.get('q')?.trim() ?? '';
  const category = params.get('category')?.trim() ?? '';
  return {
    ...(term.length > 0 && term.length <= 100 ? { q: term } : {}),
    ...(category.length > 0 && category.length <= 100 && /^[a-z0-9-]+$/u.test(category)
      ? { category }
      : {}),
    limit: 12,
  };
}

export function makeDiscoverySearch(term: string, category?: string): URLSearchParams {
  const params = new URLSearchParams();
  const q = term.trim().slice(0, 100);
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  return params;
}
