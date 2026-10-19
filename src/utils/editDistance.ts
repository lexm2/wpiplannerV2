/**
 * Edit distances for typo-tolerant search and "did you mean" suggestions.
 * Both count an adjacent swap ("rbo" for "rob") as one edit, the commonest
 * typo there is.
 */

/**
 * The fewest single-character insertions, deletions, substitutions and
 * adjacent swaps that turn `a` into `b`, or into a prefix of `b` when
 * `prefix` is set: "robtic" is one edit from the start of "robotics".
 * Gives up early, returning `limit + 1`, once every path costs more than
 * `limit`.
 */
export function editDistance(
  a: string,
  b: string,
  limit = Infinity,
  prefix = false,
): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!prefix && Math.abs(m - n) > limit) return limit + 1;

  // Rows i-2, i-1 and i of the DP table over a[0..i) by b[0..j).
  let before = new Array<number>(n + 1).fill(0);
  let previous = Array.from({ length: n + 1 }, (_, j) => j);
  let row = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    row[0] = i;
    let rowMin = row[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, before[j - 2] + 1);
      }
      row[j] = d;
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > limit) return limit + 1;
    [before, previous, row] = [previous, row, before];
  }

  // `previous` now holds the last row: all of `a` against b[0..j).
  const result = prefix ? Math.min(...previous) : previous[n];
  return Math.min(result, limit + 1);
}
/**
 * The candidates closest to `input` (case-insensitive), at most `max`, each
 * within `limit` edits, nearest first.
 */
export function closestMatches(
  input: string,
  candidates: Iterable<string>,
  { limit = 2, max = 5 }: { limit?: number; max?: number } = {},
): string[] {
  const needle = input.toLowerCase();
  const scored: [string, number][] = [];
  for (const candidate of new Set(candidates)) {
    const d = editDistance(needle, candidate.toLowerCase(), limit);
    if (d <= limit) scored.push([candidate, d]);
  }
  return scored
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([candidate]) => candidate);
}
