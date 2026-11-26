/** Keep creator category picks unique and within the existing API contract limit. */
export const MAX_VIDEO_CATEGORIES = 10;

export function toggleVideoCategory(current: readonly string[], categoryId: string): string[] {
  if (current.includes(categoryId)) return current.filter((id) => id !== categoryId);
  if (current.length >= MAX_VIDEO_CATEGORIES) return [...current];
  return [...current, categoryId];
}
