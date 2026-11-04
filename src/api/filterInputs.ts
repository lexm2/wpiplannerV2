/**
 * The search filters the course API and the MCP server take, built from the
 * app's own filter registry (FILTERS in src/core/filtering/filters). Every
 * filter there that is not internal is a key of a search's `filters`, takes
 * the filter's own criteria schema, and is run by the filter itself. So a
 * filter added to the registry is searchable in the POST body, as GET
 * `<id>=<JSON>` and through MCP with no change here, and one removed from
 * it is gone from all three.
 *
 * INPUTS adjusts that default where the API reads a filter more loosely
 * than the filter panel writes it: names for department abbreviations, the
 * earliestStart/latestEnd shorthand for time windows, CRNs for blocked
 * slots, defaults, size caps, flat GET parameters and the notices saying how
 * a query was read. An entry lists only the fields it changes; the filter's
 * other fields follow as the filter has them, so a field the filter gains is
 * taken here too.
 */
import * as z from 'zod';
import { FILTERS } from '../core/filtering/filters';
import type { TimesFilterCriteria, TimeWindow } from '../types/filters';
import { AcademicTerm } from '../types/schedule';
import { DayOfWeek } from '../types/types';
import { TERM_ORDER, TERMS } from '../utils/typeGuards';
import { TimeUtils } from '../utils/timeUtils';
import { canonicalWindows } from '../utils/timeWindows';
import type { Catalog } from './catalog';
import { termDates, yearLabel, type TermLetter } from './calendar';
import { ClockSchema, EndClockSchema, clockMinutes, clockText } from './clock';
import { blockedSlotsForCrns, MAX_CRNS } from './conflicts';
import type { EndedTermsCriteria } from './endedTermsFilter';
import { ApiError, echo, listSome } from './errors';
import { notice, type Notice } from './notices';
import {
  DELIVERY_MODES,
  resolveDegreeAttributes,
  resolveDepartments,
} from './lookup';
import { caseless, DaySchema, FallYearSchema } from './schemaHints';

/** Longest searchText.query: a code and a few words fit many times over. */
const MAX_QUERY_CHARS = 200;
/** Longest department or degree-attribute name, and how many of them. */
const MAX_NAME_CHARS = 100;
const MAX_NAMES = 30;
/** Time windows a times filter takes: a few bands on each of seven days. */
const MAX_WINDOWS = 70;

type Registered = (typeof FILTERS)[number];
/** The registry's filters the API offers: all but the internal ones. */
type Exposed = Exclude<Registered, { readonly internal: true }>;
export type FilterId = Exposed['id'];
type FilterOf<Id extends FilterId> = Extract<Exposed, { readonly id: Id }>;
type OwnShape<Id extends FilterId> = FilterOf<Id>['criteria']['shape'];
type CriteriaOf<Id extends FilterId> = z.output<FilterOf<Id>['criteria']>;

const EXPOSED = FILTERS.filter(
  filter => !('internal' in filter && filter.internal),
) as Exposed[];

/** z.strictObject whose unknown-key errors point into the whole query. */
type Obj = <S extends z.core.$ZodLooseShape>(
  shape: S,
) => z.ZodObject<S, z.core.$strict>;

/** The fields an entry gives, then the filter's own it neither gives nor omits. */
type InputShape<
  Id extends FilterId,
  F extends z.core.$ZodLooseShape,
  O extends PropertyKey,
> = F & Omit<OwnShape<Id>, keyof F | O>;

/**
 * GET /courses reads query parameters through these. They only convert
 * ("abc" becomes NaN); the schema validates.
 */
export interface ParamReader {
  has(name: string): boolean;
  str(name: string): string | undefined;
  int(name: string): number | undefined;
  num(name: string): number | undefined;
  /** true/1 and false/0; anything else as given, for the schema to refuse. */
  bool(name: string): boolean | string | undefined;
  /** Comma-separated or repeated values, trimmed, blanks dropped. */
  list(name: string): string[];
  /** A JSON object; `example` shows one in the error for anything else. */
  json(name: string, example?: string): unknown;
  /** Refuses `name` without `parent`, which it qualifies. */
  needs(name: string, parent: string): void;
  /** Refuses the request with `message`. */
  fail(message: string): never;
}

/**
 * What a search knows while reading its filters, and what reading them
 * leaves: the criteria by filter id, the notices, the ended terms left out.
 */
export interface ReadContext {
  readonly catalog: Catalog;
  /** The year searched, read before any filter: academicYear's, or the current one. */
  readonly year: number | 'all';
  readonly current: number;
  /** The current year's ended terms, when the year searched includes it. */
  readonly ended: string[];
  readonly includeEndedTerms: boolean;
  readonly criteria: Map<string, unknown>;
  readonly notices: Notice[];
  excludedEndedTerms: string[];
}

interface FilterInput<
  Id extends FilterId,
  F extends z.core.$ZodLooseShape,
  O extends keyof OwnShape<Id>,
> {
  /**
   * Fields the API takes differently from the filter, or in addition to its
   * own, in the order listed. The filter's other fields follow.
   */
  fields?: (obj: Obj) => F;
  /** The filter's own fields the API does not take: toCriteria fills them. */
  omit?: readonly O[];
  /** Rules on the input as a whole. */
  refine?: (
    schema: z.ZodObject<InputShape<Id, F, O>, z.core.$strict>,
  ) => z.ZodObject<InputShape<Id, F, O>, z.core.$strict>;
  describe?: string;
  /**
   * The filter's criteria from the parsed input; without this, the input as
   * it is. Notices about how the input was read go in ctx.notices.
   */
  toCriteria?: (
    input: z.output<z.ZodObject<InputShape<Id, F, O>>>,
    ctx: ReadContext,
  ) => CriteriaOf<Id>;
  /** When a query leaves the filter out: what applies anyway, a default. */
  absent?: (ctx: ReadContext) => void;
  /**
   * The filter picks courses rather than sections: a search with only such
   * filters leaves each row's sections out unless asked.
   */
  picksCourses?: true;
  /** Flat GET /courses parameters, besides `<id>=<JSON>` (see takesJson). */
  params?: {
    names: readonly string[];
    /** The input from them, or undefined when none is given. */
    read: (p: ParamReader) => unknown;
  };
}

/** Phantom: the input shape an entry describes, for the query's type. */
declare const shapeOf: unique symbol;
type Entry<Id extends FilterId, S> = FilterInput<
  Id,
  z.core.$ZodLooseShape,
  keyof OwnShape<Id>
> & { readonly [shapeOf]?: S };

/**
 * An INPUTS entry for filter `Id`, its field types inferred from `fields`
 * and `omit` alone. (NoInfer: INPUTS's `satisfies` would otherwise infer
 * them from the result, and an entry without fields would take any input.)
 */
function input<Id extends FilterId>() {
  return <
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    F extends z.core.$ZodLooseShape = {},
    O extends keyof OwnShape<Id> = never,
  >(
    spec: FilterInput<Id, F, O>,
  ): NoInfer<Entry<Id, InputShape<Id, F, O>>> =>
    spec as unknown as Entry<Id, InputShape<Id, F, O>>;
}

const TermSchema = caseless(TERMS).describe(
  'A, B, C, D are the 7-week quarters (A and B in fall, C and D in spring). ' +
    'F and S are full fall and spring semester sections. Matching is exact: ' +
    'A does not match an F section.',
);

const YearSchema = FallYearSchema.describe(
  'Academic year by its fall year: 2026 means 2026-27 (fall 2026 through spring 2027).',
);

const RMP_BOUNDS = [
  'minRating',
  'maxRating',
  'minDifficulty',
  'maxDifficulty',
  'minWouldTakeAgain',
  'maxWouldTakeAgain',
  'minNumRatings',
] as const;

interface TimesInput {
  windows?: TimeWindow[];
  earliestStart?: string;
  latestEnd?: string;
  days?: DayOfWeek[];
}

/**
 * The times filter's windows: those given, and the shorthand's band on
 * each of its days (every day by default).
 */
function timeWindows(times: TimesInput): TimeWindow[] {
  const windows = [...(times.windows ?? [])];
  if (times.earliestStart || times.latestEnd || times.days) {
    const startMin = times.earliestStart
      ? clockMinutes(times.earliestStart)
      : 0;
    const endMin = times.latestEnd ? clockMinutes(times.latestEnd) : 1440;
    if (endMin <= startMin) {
      throw new ApiError(
        times.earliestStart
          ? 'latestEnd must be after earliestStart.'
          : `latestEnd "${times.latestEnd}" leaves no time in the day; give a later time ("12:00"), or "24:00" for the end of the day.`,
      );
    }
    for (const day of times.days ?? TimeUtils.DAYS_ORDER) {
      windows.push({ day, startMin, endMin });
    }
  }
  return canonicalWindows(windows);
}

/** "Avoiding T,R 13:00-17:00", the windows as the filter reads them. */
function describeTimes(times: TimesFilterCriteria): string {
  const bands = new Map<string, DayOfWeek[]>();
  for (const w of times.windows) {
    const band = `${clockText(w.startMin)}-${clockText(w.endMin)}`;
    bands.set(band, [...(bands.get(band) ?? []), w.day]);
  }
  const text = [...bands]
    .map(([band, days]) => {
      const which =
        days.length === TimeUtils.DAYS_ORDER.length
          ? 'every day'
          : days.join(',');
      return band === '00:00-24:00' ? `all of ${which}` : `${which} ${band}`;
    })
    .join('; ');
  const async =
    times.includeAsync || times.mode === 'avoid'
      ? ', sections with no set time kept'
      : '';
  return times.mode === 'avoid'
    ? `Times read as: avoiding ${text}${async}.`
    : `Times read as: only within ${text}${async}.`;
}

/**
 * The criteria that leave out the sections of `ended` terms, and the notice
 * saying so. Searching one year, the term filter does it; searching every
 * year, EndedTermsFilter drops only the current year's.
 */
export function leaveOutEndedTerms(
  year: number | 'all',
  current: number,
  ended: string[],
): { id: string; criteria: unknown; notice: Notice } {
  const left = notice(
    'endedTermsLeftOut',
    `Sections in ${year === 'all' ? `${yearLabel(current)} ` : ''}terms that have ended (${ended.join(', ')}) are left out; pass includeEndedTerms: true to include them.`,
  );
  if (year === 'all') {
    const criteria: EndedTermsCriteria = { year: current, terms: ended };
    return { id: 'endedTerms', criteria, notice: left };
  }
  return {
    id: 'term',
    criteria: {
      terms: TERM_ORDER.filter(t => !ended.includes(t)) as AcademicTerm[],
    },
    notice: left,
  };
}

/** Names a caller may give loosely, as the department and degree filters take them. */
const names = (description: string) =>
  z
    .array(z.string().trim().min(1).max(MAX_NAME_CHARS))
    .min(1)
    .max(MAX_NAMES)
    .describe(description);

/**
 * Where the API reads a filter differently from the filter panel; see the
 * module comment. Keyed by filter id, so an entry for a filter no longer in
 * the registry does not compile.
 */
const INPUTS = {
  searchText: input<'searchText'>()({
    fields: () => ({
      query: z
        .string()
        .trim()
        .min(1)
        .max(MAX_QUERY_CHARS)
        .describe(
          'A course code ("MA 1022", "CS2102"; "CS 21" for every CS 21xx) finds that course first, then courses whose description names it (marked "mentions"); words after a code narrow it ("MA 1022 calculus"). ' +
            'A department name or abbreviation alone ("computer science", "CS") lists its courses by number. ' +
            'Otherwise words, ALL of which must match somewhere: code, name, description, department, degree attributes, instructor or room. ' +
            'Words of 3 letters or fewer match whole words only, and acronyms the catalog spells out ("AI" finds Artificial Intelligence); I-IV equal 1-4; words of 5+ letters tolerate a typo. ' +
            'Name matches rank above description matches, and the response says when no course is mainly about the words. Use one or two topic words ("robotics", "game design"), not sentences.',
        ),
      professorOnly: z
        .boolean()
        .optional()
        .describe('Match the words against instructor names only.'),
    }),
    toCriteria: (search, ctx) => {
      // No letter or digit survives tokenizing: as a filter it would match
      // every course, which reads as a search that found them all.
      const parsed = ctx.catalog.search.parse(search.query);
      if (!parsed.code && parsed.words.length === 0) {
        throw new ApiError(
          `"${echo(search.query)}" has no searchable words; the catalog is searched in English (letters and digits).`,
        );
      }
      return search;
    },
    picksCourses: true,
    params: {
      names: ['q', 'professorOnly'],
      read: p => {
        p.needs('professorOnly', 'q');
        return p.has('q')
          ? { query: p.str('q'), professorOnly: p.bool('professorOnly') }
          : undefined;
      },
    },
  }),

  department: input<'department'>()({
    fields: () => ({
      departments: names(
        'Abbreviations ("CS", "MA") or full names ("Computer Science"), any case.',
      ),
    }),
    toCriteria: (department, ctx) => {
      const { abbrs, notes } = resolveDepartments(
        ctx.catalog,
        department.departments,
      );
      ctx.notices.push(...notes.map(m => notice('departmentRead', m)));
      return { ...department, departments: abbrs };
    },
    picksCourses: true,
    params: {
      names: ['department'],
      read: p =>
        p.has('department') ? { departments: p.list('department') } : undefined,
    },
  }),

  term: input<'term'>()({
    fields: () => ({ terms: z.array(TermSchema).min(1).max(12) }),
    describe:
      'Keep sections in any of these terms. For everything running during A term, ask for ["A", "F"]. Naming a term that has ended keeps its sections.',
    // Terms named are kept even when they have ended, with a word that
    // their sections can no longer be taken.
    toCriteria: (term, ctx) => {
      const named = term.terms.filter(t => ctx.ended.includes(t));
      if (named.length) {
        const dates = termDates(ctx.catalog, ctx.current);
        ctx.notices.push(
          notice(
            'endedTermsListed',
            `${named.map(t => `${t} term ended ${dates?.[t as TermLetter].end ?? ''}`.trim()).join('; ')}: its sections are listed but can no longer be taken.`,
          ),
        );
      }
      return term;
    },
    // Sections of ended terms can no longer be taken, so a search without
    // terms leaves them out unless asked. Searching every year, only the
    // current year's are left out (EndedTermsFilter): another year's A is
    // not this year's.
    absent: ctx => {
      if (!ctx.ended.length) return;
      if (!ctx.includeEndedTerms) {
        ctx.excludedEndedTerms = ctx.ended;
        const left = leaveOutEndedTerms(ctx.year, ctx.current, ctx.ended);
        ctx.criteria.set(left.id, left.criteria);
        ctx.notices.push(left.notice);
        return;
      }
      ctx.notices.push(
        notice(
          'endedTermsListed',
          ctx.ended.length === 1
            ? `Term ${ctx.ended[0]} has ended: its sections are listed but can no longer be taken.`
            : `Terms ${ctx.ended.join(', ')} have ended: their sections are listed but can no longer be taken.`,
        ),
      );
    },
    params: {
      names: ['term'],
      read: p =>
        p.has('term')
          ? { terms: p.list('term').map(t => t.toUpperCase()) }
          : undefined,
    },
  }),

  academicYear: input<'academicYear'>()({
    fields: () => ({
      year: z.preprocess(
        v => (typeof v === 'string' ? v.toLowerCase() : v),
        z.union([YearSchema, z.literal('all')], {
          error: 'year is a fall year as a number (2026 for 2026-27) or "all"',
        }),
      ),
    }),
    describe:
      'Defaults to the current academic year, the only one students can schedule. A year whose schedule is not published yet is refused with a pointer to planning instead. "all" searches every year.',
    // The year is read before any filter (other filters' notices depend on
    // it); here it only becomes the criteria, given or not.
    toCriteria: (_year, ctx) => ({ year: ctx.year }),
    absent: ctx => ctx.criteria.set('academicYear', { year: ctx.year }),
    picksCourses: true,
    params: {
      names: ['year'],
      read: p => {
        const year = p.str('year');
        if (year === undefined) return undefined;
        return { year: /^all$/i.test(year) ? 'all' : p.int('year') };
      },
    },
  }),

  availability: input<'availability'>()({
    fields: () => ({
      availableOnly: z
        .boolean()
        .default(false)
        .describe(
          'Keep only sections with an open seat; labs and discussions too, so a lecture whose labs are all full is dropped.',
        ),
      minAvailable: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Keep only sections with at least this many open seats.'),
      maxWaitlisted: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Keep only sections with at most this many students waitlisted; 0 for no waitlist.',
        ),
    }),
    params: {
      names: ['availableOnly', 'minAvailable', 'maxWaitlisted'],
      read: p =>
        p.has('availableOnly') ||
        p.has('minAvailable') ||
        p.has('maxWaitlisted')
          ? {
              availableOnly: p.bool('availableOnly'),
              minAvailable: p.int('minAvailable'),
              maxWaitlisted: p.int('maxWaitlisted'),
            }
          : undefined,
    },
  }),

  creditRange: input<'creditRange'>()({
    fields: () => ({ min: z.number().min(0), max: z.number().min(0) }),
    refine: s => s.refine(c => c.max >= c.min, 'max must be at least min'),
    describe:
      'Keep courses whose credit range overlaps [min, max]. A standard WPI course is 1/3 unit = 3 credits.',
    params: {
      names: ['minCredits', 'maxCredits'],
      read: p => {
        if (!p.has('minCredits') && !p.has('maxCredits')) return undefined;
        // An open end is no bound: minCredits=200 alone is 200 and up.
        const min = p.num('minCredits') ?? 0;
        return { min, max: p.num('maxCredits') ?? Math.max(100, min) };
      },
    },
  }),

  graduateLevel: input<'graduateLevel'>()({
    params: {
      names: ['level'],
      read: p => (p.has('level') ? { level: p.str('level') } : undefined),
    },
  }),

  courseLevel: input<'courseLevel'>()({
    fields: () => ({
      min: z.number().int().min(1).max(9).optional(),
      max: z.number().int().min(1).max(9).optional(),
    }),
    refine: s =>
      s.refine(
        c => c.min === undefined || c.max === undefined || c.max >= c.min,
        'max must be at least min',
      ),
    describe:
      'Bounds on the first digit of the course number: 1 = 1000-level (MA 1022), 4 = 4000-level; 1-4 undergraduate, 5+ graduate (DS 502 and CS 5007 are both 5). {min: 3, max: 4} for upper-level undergraduate.',
    params: {
      names: ['minLevel', 'maxLevel'],
      read: p =>
        p.has('minLevel') || p.has('maxLevel')
          ? { min: p.int('minLevel'), max: p.int('maxLevel') }
          : undefined,
    },
  }),

  degreeAttribute: input<'degreeAttribute'>()({
    fields: () => ({
      attributes: names(
        'Degree requirements a course counts toward, any of them: "Humanities and Arts", "Social Sciences", "Capstone Design Experience"... (get_catalog_info lists all, with counts). Case-insensitive; a unique start like "social science" works.',
      ),
    }),
    toCriteria: (degree, ctx) => ({
      ...degree,
      attributes: resolveDegreeAttributes(ctx.catalog, degree.attributes),
    }),
    params: {
      names: ['degreeAttribute'],
      read: p =>
        p.has('degreeAttribute')
          ? { attributes: p.list('degreeAttribute') }
          : undefined,
    },
  }),

  deliveryMode: input<'deliveryMode'>()({
    fields: () => ({
      modes: z.array(caseless(DELIVERY_MODES)).min(1).max(12),
    }),
    describe:
      'Keep sections taught In-Person, Online or Hybrid. Asynchronous is different: it describes a meeting with no set time and shows as "Async"; an Online section may still meet live.',
    params: {
      names: ['deliveryMode'],
      read: p =>
        p.has('deliveryMode') ? { modes: p.list('deliveryMode') } : undefined,
    },
  }),

  offeringPattern: input<'offeringPattern'>()({
    fields: () => ({
      categories: z
        .array(
          z.union([z.literal(1), z.literal(2), z.literal(3)], {
            error:
              'offering categories are 1 (every year), 2 (every other year) or 3 (occasionally)',
          }),
        )
        .max(3)
        .describe(
          'WPI offering category: 1 = every year, 2 = at least every other year, 3 = occasionally or on demand. Empty with includeUnknown true: only courses with no category.',
        ),
      includeUnknown: z
        .boolean()
        .optional()
        .describe(
          'Also keep courses with no category on record (most graduate courses). Default false.',
        ),
    }),
    refine: s =>
      s.refine(
        o => o.categories.length > 0 || o.includeUnknown === true,
        'give at least one category, or includeUnknown: true for courses with none',
      ),
    describe:
      'The only signal of what a later year will offer: Cat. I courses are likely to run again next year.',
    params: {
      names: ['offeringPattern'],
      read: p => {
        if (!p.has('offeringPattern')) return undefined;
        const values = p.list('offeringPattern');
        // "unknown" alone: only the courses with no category on record.
        return {
          categories: values
            .filter(v => v.toLowerCase() !== 'unknown')
            .map(v => (/^\d+$/.test(v) ? Number(v) : v)),
          includeUnknown:
            values.some(v => v.toLowerCase() === 'unknown') || undefined,
        };
      },
    },
  }),

  times: input<'times'>()({
    fields: obj => ({
      mode: z
        .enum(['only', 'avoid'])
        .default('only')
        .describe(
          'Default "only": every meeting of a section must fall inside the times. "avoid": drop sections with any meeting overlapping them. ' +
            'Labs and discussions are judged too: a lecture whose labs (or discussions) all fail is dropped, and the response says so.',
        ),
      earliestStart: ClockSchema.optional().describe(
        'Shorthand, on `days` (default every day). "only": meetings start at or after this ("17:00" for evening classes). "avoid": the start of the band to avoid.',
      ),
      latestEnd: EndClockSchema.optional().describe(
        'Shorthand, on `days` (default every day). "only": meetings end by this ("12:00"). "avoid": the end of the band to avoid.',
      ),
      days: z
        .array(DaySchema)
        .min(1)
        .optional()
        .describe(
          'The days the earliestStart/latestEnd band applies to; default every day, so avoid 13:00-17:00 without days clears every weekday. ' +
            'To avoid a Tue/Thu shift only: {mode: "avoid", days: ["T", "R"], earliestStart: "13:00", latestEnd: "17:00"}. ' +
            'To keep all of Friday free: {mode: "avoid", days: ["F"]}. With "only", a day not listed has no allowed time, so sections meeting on it are dropped.',
        ),
      windows: z
        .array(
          obj({
            day: DaySchema.describe(
              'M, T, W, R (Thursday), F, S (Saturday) or U (Sunday)',
            ),
            startMin: z
              .number()
              .int()
              .min(0)
              .max(1440)
              .describe(
                'Window start in minutes after midnight: 10:00 AM is 600.',
              ),
            endMin: z
              .number()
              .int()
              .min(0)
              .max(1440)
              .describe(
                'Window end in minutes after midnight, exclusive: 1:00 PM is 780.',
              ),
          }),
        )
        .max(MAX_WINDOWS)
        .min(
          1,
          'give at least one window; to bound start and end times on every day, use earliestStart/latestEnd instead',
        )
        .refine(
          ws => ws.every(w => w.startMin < w.endMin),
          'each window must end after it starts',
        )
        .optional()
        .describe(
          'Weekly time windows, one per day and band, each weekday its own entry. With the shorthand too, both apply (their union).',
        ),
      includeAsync: z
        .boolean()
        .optional()
        .describe(
          'Mode "only": also keep sections with no scheduled meetings (async, TBD): "evening or online" is earliestStart "17:00" with includeAsync true. Default false. Mode "avoid" always keeps them: they meet at no time to avoid.',
        ),
    }),
    refine: s =>
      s.refine(
        t => !!(t.windows || t.earliestStart || t.latestEnd || t.days),
        'give windows, or earliestStart/latestEnd (and optionally days)',
      ),
    describe:
      'When sections, their labs and their discussions meet: the earliestStart/latestEnd band on `days` (default every day), windows for particular bands, or both. The response echoes the times as read.',
    toCriteria: (times, ctx) => {
      const { earliestStart, latestEnd, days, ...rest } = times;
      const criteria = {
        ...rest,
        windows: timeWindows({ ...times, earliestStart, latestEnd, days }),
      };
      ctx.notices.push(notice('timesRead', describeTimes(criteria)));
      return criteria;
    },
    params: {
      names: ['times', 'earliestStart', 'latestEnd', 'days', 'includeAsync'],
      read: p => {
        let times = p.has('times')
          ? p.json('times', '{"mode":"avoid","earliestStart":"13:00"}')
          : undefined;
        if (
          p.has('earliestStart') ||
          p.has('latestEnd') ||
          p.has('days') ||
          p.has('includeAsync')
        ) {
          times = {
            ...(times as object | undefined),
            earliestStart: p.str('earliestStart'),
            latestEnd: p.str('latestEnd'),
            days: p.has('days')
              ? p.list('days').map(d => d.toUpperCase())
              : undefined,
            includeAsync: p.bool('includeAsync'),
          };
        }
        return times;
      },
    },
  }),

  rmpRating: input<'rmpRating'>()({
    fields: () => ({
      minRating: z.number().min(0).max(5).optional(),
      maxRating: z.number().min(0).max(5).optional(),
      minDifficulty: z.number().min(0).max(5).optional(),
      maxDifficulty: z.number().min(0).max(5).optional(),
      minWouldTakeAgain: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe('Percent of raters who would take the instructor again.'),
      maxWouldTakeAgain: z.number().min(0).max(100).optional(),
      minNumRatings: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          'Ignore averages resting on fewer ratings (treated as no data). Pair it with minRating: a 5.0 from one review passes minRating 4 on its own; minNumRatings 5 keeps averages that mean something.',
        ),
      includeWithoutData: z
        .boolean()
        .optional()
        .describe(
          'Keep lectures whose instructors have no Rate My Professor data. DEFAULT: false when any bound above is given (so minRating 4 means rated 4+), true otherwise.',
        ),
    }),
    refine: s =>
      s.superRefine((r, ctx) => {
        for (const [min, max] of [
          ['minRating', 'maxRating'],
          ['minDifficulty', 'maxDifficulty'],
          ['minWouldTakeAgain', 'maxWouldTakeAgain'],
        ] as const) {
          const lo = r[min];
          const hi = r[max];
          if (lo !== undefined && hi !== undefined && lo > hi) {
            ctx.addIssue({
              code: 'custom',
              path: [max],
              message: `${max} must be at least ${min}`,
            });
          }
        }
      }),
    describe:
      "Rate My Professor bounds on 0-5 scales (difficulty: 5 is hardest), judged on the lecture's instructors; a lecture passes when any of them does. Averages on few ratings are noisy: add minNumRatings.",
    toCriteria: rmp => ({
      ...rmp,
      includeWithoutData:
        rmp.includeWithoutData ?? !RMP_BOUNDS.some(k => rmp[k] !== undefined),
    }),
    params: {
      names: [...RMP_BOUNDS, 'includeWithoutData'],
      read: p =>
        RMP_BOUNDS.some(k => p.has(k)) || p.has('includeWithoutData')
          ? {
              ...Object.fromEntries(
                RMP_BOUNDS.map(k => [
                  k,
                  k === 'minNumRatings' ? p.int(k) : p.num(k),
                ]),
              ),
              includeWithoutData: p.bool('includeWithoutData'),
            }
          : undefined,
    },
  }),

  periodConflict: input<'periodConflict'>()({
    fields: () => ({
      crns: z
        .array(z.number().int().positive())
        .min(1)
        .max(MAX_CRNS)
        .describe(
          "CRNs of sections the student already has; sections that clash with any of them are dropped, labs and discussions included. A semester section clashes with both of its quarters' sections.",
        ),
      semesterSpansQuarters: z
        .boolean()
        .optional()
        .describe(
          'Default true: an F section conflicts with A and B, S with C and D. False compares terms exactly.',
        ),
    }),
    // toCriteria derives these from the CRNs.
    omit: ['avoidConflicts', 'blockedSlots', 'selectedCourses'],
    toCriteria: ({ crns, ...rest }, ctx) => {
      const { slots, otherYear } = blockedSlotsForCrns(
        ctx.catalog,
        crns,
        ctx.year,
      );
      if (otherYear.length) {
        ctx.notices.push(
          notice(
            'conflictYears',
            `filters.periodConflict ignores CRN ${listSome(otherYear)}: not ${yearLabel(ctx.year as number)} sections, so they cannot clash with the ones searched.`,
          ),
        );
      } else if (ctx.year === 'all') {
        ctx.notices.push(
          notice(
            'conflictYears',
            'filters.periodConflict compares weekdays and terms, not years: with academicYear "all", other years\' sections are compared with these CRNs too.',
          ),
        );
      }
      return { ...rest, avoidConflicts: true, blockedSlots: slots };
    },
    params: {
      names: ['avoidCrns', 'semesterSpansQuarters'],
      read: p => {
        p.needs('semesterSpansQuarters', 'avoidCrns');
        if (!p.has('avoidCrns')) return undefined;
        return {
          crns: p
            .list('avoidCrns')
            .map(v =>
              /^\d+$/.test(v)
                ? Number(v)
                : p.fail(`avoidCrns takes CRNs in digits, got "${echo(v)}".`),
            ),
          semesterSpansQuarters: p.bool('semesterSpansQuarters'),
        };
      },
    },
  }),
} satisfies { [Id in FilterId]?: Entry<Id, unknown> };

type Inputs = typeof INPUTS;
type InputShapeOf<Id extends FilterId> = Id extends keyof Inputs
  ? NonNullable<Inputs[Id][typeof shapeOf]>
  : OwnShape<Id>;

/** The shape of a search's `filters`: each exposed filter, optional. */
export type FiltersShape = {
  [Id in FilterId]: z.ZodOptional<
    z.ZodObject<InputShapeOf<Id>, z.core.$strict>
  >;
};

/** An INPUTS entry with its types erased, for the loops below. */
type AnyInput = FilterInput<FilterId, z.core.$ZodLooseShape, never> & {
  toCriteria?: (input: unknown, ctx: ReadContext) => unknown;
  refine?: (schema: z.ZodObject) => z.ZodObject;
};

const specOf = (id: string) =>
  (INPUTS as Partial<Record<string, AnyInput>>)[id];

/** A search's `filters` input, from the registry and INPUTS. */
export function filtersSchema(
  obj: Obj,
): z.ZodObject<FiltersShape, z.core.$strict> {
  const shape: Record<string, z.ZodType> = {};
  for (const filter of EXPOSED) {
    const spec = specOf(filter.id);
    const own: z.core.$ZodLooseShape = filter.criteria.shape;
    const given = spec?.fields?.(obj) ?? {};
    const omitted = new Set<string>(spec?.omit ?? []);
    let schema: z.ZodObject = obj({
      ...given,
      ...Object.fromEntries(
        Object.entries(own).filter(([k]) => !(k in given) && !omitted.has(k)),
      ),
    });
    // Taken as the filter has it, the input keeps the filter's own rules.
    if (!spec?.fields && !spec?.omit) {
      const rules = (filter.criteria._zod.def.checks ?? []) as z.core.$ZodCheck<
        Record<string, unknown>
      >[];
      schema = schema.check(...rules);
    }
    if (spec?.refine) schema = spec.refine(schema);
    const description = spec?.describe ?? filter.criteria.description;
    shape[filter.id] = description
      ? schema.optional().describe(description)
      : schema.optional();
  }
  return obj(shape as FiltersShape);
}

type FiltersInput = Partial<Record<FilterId, unknown>>;

/**
 * Each filter's criteria from a parsed `filters`, into ctx.criteria, in
 * registry order: the entry's toCriteria, or the input as it is; and for a
 * filter left out, its default. The filter's own schema has the last word,
 * so criteria it refuses are a 400 naming the filter, never a failed search.
 */
export function readFilters(filters: FiltersInput, ctx: ReadContext): void {
  for (const filter of EXPOSED) {
    const spec = specOf(filter.id);
    const given = filters[filter.id];
    if (given === undefined) {
      spec?.absent?.(ctx);
      continue;
    }
    const criteria = spec?.toCriteria ? spec.toCriteria(given, ctx) : given;
    const checked = filter.criteria.safeParse(criteria);
    if (!checked.success) {
      throw new ApiError(
        `filters.${filter.id}: ${checked.error.issues.map(i => i.message).join('; ')}`,
        400,
        checked.error.issues,
      );
    }
    ctx.criteria.set(filter.id, criteria);
  }
}

/** Whether every filter given picks courses rather than sections. */
export const picksCoursesOnly = (filters: FiltersInput) =>
  (Object.keys(filters) as FilterId[]).every(
    id => filters[id] === undefined || !!specOf(id)?.picksCourses,
  );

/**
 * Whether GET /courses takes the filter as `<id>=<JSON>`: every filter does,
 * so a field it gains is reachable by GET too, unless one of its flat
 * parameters already has that name (department=CS,MA; times is JSON itself).
 */
const takesJson = (filter: Exposed) =>
  !specOf(filter.id)?.params?.names.includes(filter.id);

/** The GET /courses parameters the filters read. */
export const FILTER_PARAMS: readonly string[] = EXPOSED.flatMap(filter => [
  ...(specOf(filter.id)?.params?.names ?? []),
  ...(takesJson(filter) ? [filter.id] : []),
]);

/**
 * A search's `filters` from GET /courses parameters: a filter's flat ones,
 * or its id with the input as JSON (graduateLevel={"level":"undergraduate",
 * "undergradLevel":2000}), not both.
 */
export function filtersFromParams(p: ParamReader): FiltersInput {
  const filters: FiltersInput = {};
  for (const filter of EXPOSED) {
    const params = specOf(filter.id)?.params;
    const flat = params?.read(p);
    if (takesJson(filter) && p.has(filter.id)) {
      if (flat !== undefined) {
        const given = params!.names.filter(n => p.has(n));
        p.fail(
          `${filter.id} and ${given.join(', ')} both give filters.${filter.id}; use one or the other.`,
        );
      }
      filters[filter.id] = p.json(filter.id);
    } else if (flat !== undefined) {
      filters[filter.id] = flat;
    }
  }
  return filters;
}
