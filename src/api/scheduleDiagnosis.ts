/**
 * Why generate_schedules found nothing, said about the actual request: the
 * course pairs whose sections all clash (named with the times they share,
 * from the same finder check_conflicts uses), and the sections the defaults
 * left out of a course that has none left. Only remedies that could apply
 * to these courses are suggested.
 */
import type { AcademicTerm } from '../types/schedule';
import type { Course, Section } from '../types/types';
import { masksConflict } from '../core/scheduling/BitMaskEngine';
import type { MaskedCandidate } from '../services/scheduling/AutoScheduler';
import type { Catalog } from './catalog';
import { findConflicts, termsMeet } from './conflicts';
import { courseCode } from './serialize';
import { andList, plural } from './text';

/** What the request did to make sections unavailable, and how to undo it. */
export interface DiagnosisRequest {
  /** Terms the ended-term rule left out; empty when none were. */
  endedLeftOut: string[];
  closedLeftOut: boolean;
  openSeatsOnly: boolean;
  hasBusy: boolean;
  hasKeepCrns: boolean;
  /** The terms asked for, per course code. */
  termsAsked: Map<Course, string[]>;
}

const MAX_PAIRS = 3;

/** Every section of `course` in the catalog's index. */
function sectionsOfCourse(catalog: Catalog, course: Course): Section[] {
  const sections: Section[] = [];
  for (const entry of catalog.sectionsByCrn.values()) {
    if (entry.courses.includes(course)) sections.push(entry.section);
  }
  return sections;
}

/** Why one course has no section that can be scheduled. */
export function whyNoSection(
  catalog: Catalog,
  course: Course,
  request: DiagnosisRequest,
): string {
  const sections = sectionsOfCourse(catalog, course);
  const timed = sections.filter(s =>
    s.periods.some(p => p.isAsync || p.days.size),
  );
  const code = courseCode(course);
  if (timed.length === 0) {
    return `${code} has no section with meeting times.`;
  }
  const reasons: string[] = [];
  const inEnded = timed.filter(s =>
    request.endedLeftOut.includes(s.computedTerm),
  );
  if (inEnded.length) {
    reasons.push(
      `${plural(inEnded.length, 'section')} ${inEnded.length === 1 ? 'is' : 'are'} in ended terms (${andList([...new Set(inEnded.map(s => s.computedTerm))])}); includeEndedTerms: true allows them`,
    );
  }
  const live = timed.filter(s => !inEnded.includes(s));
  const closed = live.filter(s => s.status === 'Closed');
  if (request.closedLeftOut && closed.length) {
    reasons.push(
      `${plural(closed.length, 'section')} ${closed.length === 1 ? 'is' : 'are'} Closed for registration; includeClosed: true allows them`,
    );
  }
  const asked = request.termsAsked.get(course);
  const outside = asked
    ? live.filter(s => !closed.includes(s) && !asked.includes(s.computedTerm))
    : [];
  if (outside.length) {
    reasons.push(
      `${plural(outside.length, 'section')} ${outside.length === 1 ? 'is' : 'are'} outside the terms asked (${asked!.join(', ')}); it runs in ${andList([...new Set(outside.map(s => s.computedTerm))])}`,
    );
  }
  if (request.openSeatsOnly) {
    const full = live.filter(
      s => s.status !== 'Closed' && s.seatsAvailable <= 0 && s.seats > 0,
    );
    if (full.length) {
      reasons.push(
        `${plural(full.length, 'section')} ${full.length === 1 ? 'is' : 'are'} full; openSeatsOnly: false allows them`,
      );
    }
  }
  if (request.hasBusy || request.hasKeepCrns) {
    reasons.push(
      `the rest meet during the busy blocks or the sections in keepCrns`,
    );
  }
  return reasons.length
    ? `${code}: ${reasons.join('; ')}.`
    : `${code} has no section that can be scheduled with these options.`;
}

/** Course pairs none of whose candidate combinations can be taken together. */
function clashingPairs(
  candidates: MaskedCandidate[][],
  courses: Course[],
): { a: Course; b: Course; ca: MaskedCandidate; cb: MaskedCandidate }[] {
  const pairs = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const clash = candidates[i].every(ca =>
        candidates[j].every(
          cb =>
            termsMeet(ca.term as AcademicTerm, cb.term as AcademicTerm) &&
            masksConflict(ca.mask, cb.mask),
        ),
      );
      if (clash) {
        pairs.push({
          a: courses[i],
          b: courses[j],
          ca: candidates[i][0],
          cb: candidates[j][0],
        });
      }
    }
  }
  return pairs;
}

const crnsOf = (c: MaskedCandidate) =>
  Object.values(c.combination).map(s => s.crn);

/**
 * Why every combination of the courses' sections clashes: the clashing
 * pairs when there are any, else what a clash among three or more, or with
 * what is blocked, could be.
 */
export function whyNoCombination(
  catalog: Catalog,
  candidates: MaskedCandidate[][],
  courses: Course[],
  request: DiagnosisRequest,
): string {
  const pairs = clashingPairs(candidates, courses);
  const hints: string[] = [];
  const allowable = (c: Course) => {
    const sections = sectionsOfCourse(catalog, c);
    return {
      ended:
        request.endedLeftOut.length > 0 &&
        sections.some(s => request.endedLeftOut.includes(s.computedTerm)),
      closed:
        request.closedLeftOut && sections.some(s => s.status === 'Closed'),
    };
  };
  const involved = pairs.length ? pairs.flatMap(p => [p.a, p.b]) : courses;

  const text: string[] = [];
  if (pairs.length) {
    const shown = pairs.slice(0, MAX_PAIRS).map(({ a, b, ca, cb }) => {
      const [codeA, codeB] = [courseCode(a), courseCode(b)];
      const check = findConflicts(catalog, [...crnsOf(ca), ...crnsOf(cb)]);
      const found = check.conflicts.find(
        c => c.a.courses.includes(codeA) !== c.b.courses.includes(codeA),
      );
      let example = '';
      if (found) {
        const [sa, sb] = found.a.courses.includes(codeA)
          ? [found.a, found.b]
          : [found.b, found.a];
        const times = found.overlaps
          .map(o => `${o.days.join('')} ${o.start}-${o.end}`)
          .join(', ');
        example = `, for example ${codeA} ${sa.section} (CRN ${sa.crn}) and ${codeB} ${sb.section} (CRN ${sb.crn}) both meet ${times}`;
      }
      return `${codeA} and ${codeB} clash in every combination of their sections${example}`;
    });
    text.push(
      `${shown.join('. ')}${pairs.length > MAX_PAIRS ? `. ${plural(pairs.length - MAX_PAIRS, 'more pair')} also clash` : ''}.`,
    );
    hints.push(
      `drop one course of ${pairs.length === 1 ? 'the pair' : 'each pair'}`,
    );
  } else {
    text.push(
      'No two of the courses clash on their own; the clash is among three or more of them, or with what is blocked.',
    );
    hints.push('try fewer courses');
  }
  if (involved.some(c => allowable(c).ended)) {
    hints.push('includeEndedTerms: true adds sections of ended terms');
  }
  if (involved.some(c => allowable(c).closed)) {
    hints.push('includeClosed: true adds Closed sections');
  }
  if (request.openSeatsOnly)
    hints.push('openSeatsOnly: false adds full sections');
  if (request.termsAsked.size)
    hints.push('more terms for a course adds sections');
  if (request.hasBusy) hints.push('fewer busy blocks');
  if (request.hasKeepCrns) hints.push('fewer keepCrns');
  text.push(`To fix: ${hints.join('; ')}.`);
  return text.join(' ');
}
