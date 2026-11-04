/**
 * What a result says beside its data: how the input was read, what the
 * defaults left out, what to try instead. `message` says it in words, for
 * a model or a student to read (the MCP text quotes it as is); `code` says
 * which kind it is, for a caller acting on it rather than reading it.
 */
export type NoticeCode =
  // How the input was read.
  /** A department given loosely, matched to one ("compsci" as CS). */
  | 'departmentRead'
  /** A course found by its title. */
  | 'titleRead'
  /** A CRN, named as the course section it is. */
  | 'crnRead'
  /** A query word read as an acronym the catalog defines too. */
  | 'acronymRead'
  /** Query words past the first MAX_QUERY_WORDS, not searched by. */
  | 'wordsIgnored'
  /** The times filter, as the windows it applies. */
  | 'timesRead'
  /** Busy blocks on a weekend, which schedules are not fitted around. */
  | 'weekendIgnored'
  /** A WPI term (MQP, IQP, HUA) course text cannot answer alone. */
  | 'knownTerm'
  // What is left out or cannot be taken.
  /** Sections of ended terms, left out by default. */
  | 'endedTermsLeftOut'
  /** Ended terms' sections, listed as asked, though they cannot be taken. */
  | 'endedTermsListed'
  /** Courses dropped because their labs or discussions failed a filter. */
  | 'companionsDropped'
  /** A delivery mode asked for that no matching section has. */
  | 'deliveryModeMissing'
  /** periodConflict or keepCrns CRNs of another year, or compared across years. */
  | 'conflictYears'
  // Where the results stand.
  /** Searching every year, though only the current one can be scheduled. */
  | 'allYears'
  /** The sort the results are in. */
  | 'sorted'
  /** A loose description-only search, cut to the closest few. */
  | 'closestOnly'
  /** The offset is past the last match. */
  | 'offsetPastEnd'
  /** No course matched the words, but an instructor's name is close. */
  | 'instructorSuggested'
  /** The query asks to register, which the catalog cannot do. */
  | 'registration'
  /** generate_schedules: no schedule fits, and the likely causes. */
  | 'noSchedule'
  /** generate_schedules: the search ran out of time, so the answer may be partial. */
  | 'searchCutShort'
  /** generate_schedules: the search stopped at its cap of schedules. */
  | 'searchCapped'
  /** One of an unpublished year's early entries: tentative. */
  | 'earlyEntry'
  /** A past year's offering. */
  | 'pastYear';

export interface Notice {
  code: NoticeCode;
  message: string;
}

export const notice = (code: NoticeCode, message: string): Notice => ({
  code,
  message,
});
