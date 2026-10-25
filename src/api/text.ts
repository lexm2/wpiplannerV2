/** Small pieces of English the API and MCP messages share. */

/** "1 section", "3 sections", or `plurals` for an irregular word. */
export const plural = (n: number, word: string, plurals = `${word}s`) =>
  `${n} ${n === 1 ? word : plurals}`;

/** The form that agrees with a count: one(n, 'is', 'are'). */
export const one = (n: number, singular: string, plurals: string) =>
  n === 1 ? singular : plurals;

/** "1, 2, 3", or the first `max` and `tail(rest)`: "1, 2 +3 more". */
export function listFirst(
  items: readonly (string | number)[],
  max: number,
  tail = (rest: number) => `+${rest} more`,
): string {
  const shown = items.slice(0, max).join(', ');
  const rest = items.length - max;
  return rest > 0 ? `${shown} ${tail(rest)}` : shown;
}

/** "A, B and C"; empty for none. */
export function andList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}
