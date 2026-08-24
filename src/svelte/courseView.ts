import { getAllSections } from '../utils/courseUtils';
import { rateMyProfessorService } from '../services/external/RateMyProfessorService';
import type { Course, Section } from '../types/types';

/**
 * Pure per-course view-model construction for the course list - extracted from
 * CourseList.svelte so the component stays render-only. Mirrors the old
 * ProgressiveRenderer.createCourseListItem: term availability + the (deduped)
 * section badges per term.
 */

const TERMS = ['A', 'B', 'C', 'D'] as const;
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
}

export interface CourseView {
  course: Course;
  hasWarning: boolean;
  terms: TermInfo[];
  sectionsByTerm: Map<
    string,
    { badges: SectionBadge[]; overflow: number; allFull: boolean }
  >;
}

function isMeaningfulProf(prof: string): boolean {
  return (
    !!prof && prof !== 'TBA' && prof !== 'Not Assigned' && prof.trim() !== ''
  );
}

// Identity-keyed memo: a CourseView depends only on the Course object, which is
// a `$state.raw` value replaced wholesale on data refresh - so a cache hit means
// the data is unchanged, and refreshed courses are new objects that miss cleanly.
// Saves rebuilding the already-shown rows every time load-more grows `displayed`.
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

  const terms: TermInfo[] = TERMS.map(term => {
    const secs = sectionsByTermRaw.get(term);
    return {
      term,
      available: !!secs,
      allFull: !!secs && secs.every(s => s.seatsAvailable <= 0),
    };
  });

  const sectionsByTerm = new Map<
    string,
    { badges: SectionBadge[]; overflow: number; allFull: boolean }
  >();
  for (const term of TERMS) {
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
        s.periods.some(p => isMeaningfulProf(p.professor)),
      );
      if (withProf.length > 0) deduped.push(...withProf);
      else deduped.push(group[0]);
    });

    const total = deduped.length;
    const display = deduped.slice(0, MAX_BADGES);
    const badges: SectionBadge[] = display.map((section, i) => {
      const profSet = new Set<string>();
      section.periods.forEach(p => {
        if (isMeaningfulProf(p.professor)) profSet.add(p.professor);
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
      allFull: sections.every(s => s.seatsAvailable <= 0),
    });
  }

  const courseView: CourseView = { course, hasWarning, terms, sectionsByTerm };
  courseViewCache.set(course, courseView);
  return courseView;
}
