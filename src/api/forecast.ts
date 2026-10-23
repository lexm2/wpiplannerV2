/**
 * What can honestly be said about a course in a year whose schedule WPI has
 * not published. WPI sets each year's terms and times anew, so the only
 * signal is the course's offering category, read alongside where it falls
 * in the year we do have. Nothing here invents a term or a time.
 */
import type { Course } from '../types/types';
import { alternatesInto } from '../utils/alternatingYears';
import { yearLabel } from './calendar';

type Outlook = 'likely' | 'possible' | 'unlikely' | 'uncertain' | 'unknown';

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
  /**
   * The description's alternating-years statement, quoted, and whether it
   * fits `basedOn` (runs in a year it names, or skips one it does not):
   * only a statement that fits is used to call `year`.
   */
  alternating: { statement: string; fitsBaseYear: boolean } | null;
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
 * What the description's alternating-years statement says of `year`, when
 * it has one: used only when it agrees with what `basedOn` shows.
 */
function alternatingLead(
  course: Course,
  year: number,
  basedOn: number,
  runsInBase: boolean,
): { outlook: Outlook; lead: string; fitsBaseYear: boolean } | null {
  const a = course.alternatingYears;
  if (!a) return null;
  const target = yearLabel(year);
  const base = yearLabel(basedOn);
  const quote = `(the catalog description: "${a.statement}")`;
  const fitsBaseYear = alternatesInto(a, basedOn) === runsInBase;
  if (!fitsBaseYear) {
    return {
      outlook: 'possible',
      fitsBaseYear,
      lead: `The catalog description says "${a.statement}" That would ${runsInBase ? `skip ${base}, yet it runs in ${base}` : `put it in ${base}, yet it has no sections then`}; the statement looks out of date, so whether it runs in ${target} is uncertain.`,
    };
  }
  const runs = alternatesInto(a, year);
  return {
    outlook: runs ? 'likely' : 'unlikely',
    fitsBaseYear,
    lead: runs
      ? `Alternating years; ${runsInBase ? `runs in ${base}` : `not offered in ${base}`}, so likely offered in ${target} ${quote}.`
      : `Alternating years; ${runsInBase ? `runs in ${base}` : `not offered in ${base}`}, so likely not offered in ${target} ${quote}.`,
  };
}

/**
 * The outlook for `course` (a `basedOn`-year course) in `year`, given the
 * terms it runs in during `basedOn`. Only the year after `basedOn` can be
 * read off an alternating pattern from what `basedOn` shows.
 */
export function forecastCourse(
  course: Course,
  year: number,
  basedOn: number,
  termsInBaseYear: string[],
): Forecast {
  const category = course.category ?? null;
  const target = yearLabel(year);
  const base = yearLabel(basedOn);
  const runsInBase = termsInBaseYear.length > 0;
  let outlook: Outlook = category ? PATTERN[category].outlook : 'unknown';
  let lead = category
    ? PATTERN[category].lead.replace('{year}', target)
    : `No offering pattern on record${course.isGraduate ? ' (usual for graduate courses)' : ''}, so whether it runs in ${target} is unknown.`;

  const parity =
    year === basedOn + 1
      ? alternatingLead(course, year, basedOn, runsInBase)
      : null;
  if (parity && category === 1) {
    // Cat. I says every year; the description disagrees. Say both.
    lead += ` The description, though, says it alternates years: "${course.alternatingYears!.statement}"`;
  } else if (parity) {
    outlook = parity.outlook;
    lead = parity.lead;
  } else if (category === 2 && year === basedOn + 1) {
    lead += runsInBase
      ? ` It runs in ${base}, and a course offered every other year is less likely to run again in ${target}.`
      : ` It has no sections in ${base}, so if it alternates, ${target} would be its year.`;
  }

  const ran = runsInBase
    ? `in ${base} it runs in ${listTerms(termsInBaseYear)}`
    : `it has no sections in ${base}`;
  const alternating = course.alternatingYears
    ? {
        statement: course.alternatingYears.statement,
        fitsBaseYear:
          alternatesInto(course.alternatingYears, basedOn) === runsInBase,
      }
    : null;

  return {
    year,
    basedOn,
    category,
    outlook,
    termsInBaseYear,
    alternating,
    summary: `${lead} Terms and times for ${target} are not published yet; ${ran}.`,
  };
}
