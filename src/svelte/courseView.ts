import { getAllSections } from '../utils/courseUtils';
import { QUARTER_TERMS, TERM_ORDER } from '../utils/typeGuards';
import { rateMyProfessorService } from '../services/external/RateMyProfessorService';
import type { Course, Section } from '../types/types';

/**
 * Pure per-course view-model construction for the course list, kept out of
 * CourseList.svelte so the component stays render-only: term availability +
 * the (deduped) section badges per term.
 */

const MAX_BADGES = 100;

type ProfLink = { text: string; url: string | null };

interface SectionBadge {
  key: string;
  number: string;
  isFull: boolean;
  profPlain: string;
  profs: ProfLink[];
}

interface TermInfo {
  term: string;
  available: boolean;
  allFull: boolean;
  /** Nothing but interest-list placeholders: no real section to be full. */
  onlyInterestList: boolean;
}

/**
 * "Full" judges real sections. An interest list always shows zero seats, so
 * counting it would label a term full when filters merely hid its sections.
 */
const termStatus = (secs: Section[]) => {
  const real = secs.filter(s => !s.isInterestList);
  return {
    allFull: real.length > 0 && real.every(s => s.seatsAvailable <= 0),
    onlyInterestList: real.length === 0,
  };
};

export interface CourseView {
  course: Course;
  hasWarning: boolean;
  terms: TermInfo[];
  sectionsByTerm: Map<string, TermSections>;
}

interface TermSections {
  badges: SectionBadge[];
  overflow: number;
  allFull: boolean;
  onlyInterestList: boolean;
}

export const INTEREST_LIST_ONLY_TITLE =
  'Only an interest list is shown - other sections are not scheduled or are hidden by your filters';

// Identity-keyed memo: a CourseView depends only on the Course object, which is
// a `$state.raw` value replaced wholesale on data refresh - so a cache hit means
// the data is unchanged, and refreshed courses are new objects that miss cleanly.
// Saves rebuilding the already-shown rows every time the list grows `displayed`.
const courseViewCache = new WeakMap<Course, CourseView>();

export function buildCourseView(course: Course): CourseView {
  const cached = courseViewCache.get(course);
  if (cached) return cached;

  const allSecs = getAllSections(course);
  const sectionsByTermRaw = new Map<string, Section[]>();
  for (const section of allSecs) {
    const term = section.computedTerm || 'Unknown';
    if (!sectionsByTermRaw.has(term)) sectionsByTermRaw.set(term, []);
    sectionsByTermRaw.get(term)!.push(section);
  }

  const hasWarning =
    allSecs.length > 0 && allSecs.every(s => s.seatsAvailable <= 0);

  // Quarters always get a badge (greyed when not offered) so rows line up;
  // semester terms only when the course offers them.
  const shownTerms = TERM_ORDER.filter(
    term => QUARTER_TERMS.includes(term) || sectionsByTermRaw.has(term),
  );
  const terms: TermInfo[] = shownTerms.map(term => {
    const secs = sectionsByTermRaw.get(term);
    return {
      term,
      available: !!secs,
      ...(secs
        ? termStatus(secs)
        : { allFull: false, onlyInterestList: false }),
    };
  });

  const sectionsByTerm = new Map<string, TermSections>();
  for (const term of TERM_ORDER) {
    const sections = sectionsByTermRaw.get(term);
    if (!sections) continue;

    // Dedupe sections sharing a number, preferring those that list a professor.
    const byNumber = new Map<string, Section[]>();
    for (const section of sections) {
      if (!byNumber.has(section.number)) byNumber.set(section.number, []);
      byNumber.get(section.number)!.push(section);
    }
    const deduped: Section[] = [];
    byNumber.forEach(group => {
      if (group.length <= 1) {
        deduped.push(...group);
        return;
      }
      const withProf = group.filter(s =>
        s.periods.some(p => p.instructors.length > 0),
      );
      if (withProf.length > 0) deduped.push(...withProf);
      else deduped.push(group[0]);
    });

    const total = deduped.length;
    const display = deduped.slice(0, MAX_BADGES);
    const badges: SectionBadge[] = display.map((section, i) => {
      const profSet = new Set<string>();
      section.periods.forEach(p => {
        for (const name of p.instructors) profSet.add(name);
      });
      const profArray = Array.from(profSet);
      const profPlain = profArray.join(', ') || 'TBA';
      const profs: ProfLink[] =
        profArray.length > 0
          ? profArray.map(prof => ({
              text: prof,
              url: rateMyProfessorService.getProfessorRMPUrl(prof),
            }))
          : [{ text: 'TBA', url: null }];
      return {
        key: `${section.number}-${i}`,
        number: section.number,
        isFull: section.seatsAvailable <= 0,
        profPlain,
        profs,
      };
    });

    sectionsByTerm.set(term, {
      badges,
      overflow: total > MAX_BADGES ? total - MAX_BADGES : 0,
      ...termStatus(sections),
    });
  }

  const courseView: CourseView = { course, hasWarning, terms, sectionsByTerm };
  courseViewCache.set(course, courseView);
  return courseView;
}
