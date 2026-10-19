/**
 * WPI course descriptions state some courses' parity in prose: "This course
 * will be offered in 2020-21, and in alternating years thereafter." Read
 * conservatively, so a statement only counts in that exact form, with a
 * year range whose halves follow each other.
 */
import type { AlternatingYears } from '../types/types';

const STATEMENT_RE =
  /\b(?:This|The) course (?:will be |is )?(?:first )?(?:offered|taught) in (\d{4})\s*-\s*(\d{4}|\d{2}),? and (?:in )?alternat(?:e|ing) years thereafter\b\s*\.?/i;

/** The description's alternating-years statement, or null when it has none. */
export function readAlternatingYears(
  description: string,
): AlternatingYears | null {
  const m = STATEMENT_RE.exec(description);
  if (!m) return null;
  const firstYear = Number(m[1]);
  const next =
    m[2].length === 4
      ? Number(m[2])
      : Number(m[2]) + 100 * Math.floor((firstYear + 1) / 100);
  if (next !== firstYear + 1) return null;
  const statement = m[0].trim().replace(/\s*\.?$/, '.');
  return { firstYear, statement };
}

/** Whether the statement puts the course in the academic year `year` (fall year). */
export function alternatesInto(a: AlternatingYears, year: number): boolean {
  return Math.abs(year - a.firstYear) % 2 === 0;
}
