/**
 * What can honestly be said about a course in a year whose schedule WPI has
 * not published. WPI sets each year's terms and times anew, so the only
 * signal is the course's offering category, read alongside where it falls
 * in the year we do have. Nothing here invents a term or a time.
 */
import type { Course } from '../types/types';
import { yearLabel } from './calendar';

type Outlook = 'likely' | 'possible' | 'uncertain' | 'unknown';

export interface Forecast {
  /** The unpublished year the forecast is for. */
  year: number;
  /** The year whose schedule it reads. */
  basedOn: number;
  /** WPI offering category: 1 every year, 2 every other year, 3 occasionally. */
  category: 1 | 2 | 3 | null;
  outlook: Outlook;
  /** Terms the course has sections in during `basedOn`. */
  termsInBaseYear: string[];
  /** One or two sentences to pass on to a student as they stand. */
  summary: string;
}

const PATTERN: Record<1 | 2 | 3, { outlook: Outlook; lead: string }> = {
  1: {
    outlook: 'likely',
    lead: 'Likely offered in {year} (Cat. I: offered every year).',
  },
  2: {
    outlook: 'possible',
    lead: 'May or may not be offered in {year} (Cat. II: offered at least every other year).',
  },
  3: {
    outlook: 'uncertain',
    lead: 'Uncertain for {year} (Cat. III: offered occasionally or on demand).',
  },
};

function listTerms(terms: string[]): string {
  if (terms.length <= 1) return terms.join('');
  return `${terms.slice(0, -1).join(', ')} and ${terms.at(-1)}`;
}

/**
 * The outlook for `course` (a `basedOn`-year course) in `year`, given the
 * terms it runs in during `basedOn`.
 */
export function forecastCourse(
  course: Course,
  year: number,
  basedOn: number,
  termsInBaseYear: string[],
): Forecast {
  const category = course.category ?? null;
  const target = yearLabel(year);
  const lead = category
    ? PATTERN[category].lead.replace('{year}', target)
    : `No offering pattern on record (usual for graduate courses), so whether it runs in ${target} is unknown.`;
  const base = yearLabel(basedOn);
  const ran = termsInBaseYear.length
    ? `in ${base} it runs in ${listTerms(termsInBaseYear)}`
    : `it has no sections in ${base}`;

  return {
    year,
    basedOn,
    category,
    outlook: category ? PATTERN[category].outlook : 'unknown',
    termsInBaseYear,
    summary: `${lead} Terms and times for ${target} are not published yet; ${ran}.`,
  };
}
