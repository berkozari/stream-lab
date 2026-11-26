/**
 * Prisma's PostgreSQL `contains` uses LIKE/ILIKE, where %, _ and \\ are special.
 * Treat search input as literal text, not a user-controlled SQL pattern.
 * Prisma still parameterizes this value; this is not raw SQL escaping.
 */
export function escapeLikeLiteral(input: string): string {
  return input.replace(/[\\%_]/gu, '\\$&');
}

/** Same literal search for title and nullable description. */
export function videoSearchFilter(q: string) {
  const literal = escapeLikeLiteral(q);
  return {
    OR: [
      { title: { contains: literal, mode: 'insensitive' as const } },
      { description: { contains: literal, mode: 'insensitive' as const } },
    ],
  };
}
