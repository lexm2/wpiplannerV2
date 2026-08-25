// Pure, DOM-free helpers for the component-selection wizard.
//
// Lifted near-verbatim from the old vanilla `ComponentSelectionWizard` class so the
// Svelte component can derive everything reactively. Nothing here touches the DOM -
// it's all course-structure / filtering math, which keeps it easy to reason about
// and unit-test.

import type {
  ComponentKind,
  Course,
  Section,
  Period,
  SectionsByKind,
} from '../types/types';

import type { CourseDataService } from '../services/data/courseDataService';
import type { FilterService } from '../services/filtering/FilterService';
import type { AcademicYearFilterCriteria } from '../types/filters';

const TERM_ORDER = ['A', 'B', 'C', 'D', 'E'];

const TERM_NAMES: Record<string, string> = {
  A: 'A Term (Fall 1)',
  B: 'B Term (Fall 2)',
  C: 'C Term (Spring 1)',
  D: 'D Term (Spring 2)',
  E: 'E Term (Summer)',
};

/**
 * Which steps are available for a course, given the currently-selected lecture.
 * Only steps that actually have options are returned.
 */
export function determineAvailableSteps(
  course: Course,
  courseDataService: CourseDataService,
  selectedLecture: Section | null,
): ComponentKind[] {
  const steps: ComponentKind[] = [];
  const isHierarchical = courseDataService.isHierarchicalCourse(course);
  const isLabOnly = courseDataService.isLabOnlyCourse(course);

  if (isLabOnly) {
    if (courseDataService.getStandaloneLabs(course).length > 0) {
      steps.push('lab');
    }
  } else if (isHierarchical) {
    const lectures = courseDataService.getLecturesForCourse(course);
    if (lectures.length > 0) {
      steps.push('lecture');

      if (selectedLecture) {
        return computeStepsForLecture(
          course,
          courseDataService,
          selectedLecture,
        );
      }

      const hasDiscussions = lectures.some(
        lg => lg.compatibleDiscussions.length > 0,
      );
      const hasLabs = lectures.some(lg => lg.compatibleLabs.length > 0);
      if (hasDiscussions) steps.push('discussion');
      if (hasLabs) steps.push('lab');
    }
  }

  return steps;
}

/** Steps relevant to one specific lecture section. */
function computeStepsForLecture(
  course: Course,
  courseDataService: CourseDataService,
  lecture: Section,
): ComponentKind[] {
  const steps: ComponentKind[] = ['lecture'];
  const discussions = courseDataService
    .getDiscussionsForLecture(course, lecture)
    .filter(s => !s.isInterestList);
  const labs = courseDataService
    .getLabsForLecture(course, lecture)
    .filter(s => !s.isInterestList);
  if (discussions.length > 0) steps.push('discussion');
  if (labs.length > 0) steps.push('lab');
  return steps;
}

/**
 * Sections available for a step, plus how many were hidden by the active schedule
 * filters (for the "N hidden" notice).
 */
export function getOptionsWithFilterInfo(
  course: Course,
  courseDataService: CourseDataService,
  filterService: FilterService | null,
  step: ComponentKind,
  selections: SectionsByKind,
): { filtered: Section[]; totalBeforeFilter: number } {
  let sections: Section[] = [];

  if (step === 'lecture') {
    if (courseDataService.isLabOnlyCourse(course)) {
      sections = courseDataService.getStandaloneLabs(course);
    } else {
      sections = courseDataService
        .getLecturesForCourse(course)
        .map(lg => lg.section);
    }
  } else if (step === 'discussion') {
    sections = selections.lecture
      ? courseDataService.getDiscussionsForLecture(course, selections.lecture)
      : getAllDiscussionsForCourse(course, courseDataService);
  } else if (step === 'lab') {
    if (courseDataService.isLabOnlyCourse(course)) {
      sections = courseDataService.getStandaloneLabs(course);
    } else {
      sections = selections.lecture
        ? courseDataService.getLabsForLecture(course, selections.lecture)
        : getAllLabsForCourse(course, courseDataService);
    }
  }

  // Term-filter child components to the selected lecture's term.
  if (step !== 'lecture' && selections.lecture && sections.length > 0) {
    const lectureTerm = selections.lecture.computedTerm;
    sections = sections.filter(s => s.computedTerm === lectureTerm);
  }

  sections = sections.filter(s => !s.isInterestList);
  const totalBeforeFilter = sections.length;

  if (filterService && !filterService.isEmpty() && sections.length > 0) {
    const passing = new Set(
      filterService.apply([course]).map(fs => fs.section.crn),
    );
    return {
      filtered: sections.filter(s => passing.has(s.crn)),
      totalBeforeFilter,
    };
  }

  return { filtered: sections, totalBeforeFilter };
}

function getAllDiscussionsForCourse(
  course: Course,
  cds: CourseDataService,
): Section[] {
  const all = new Map<number, Section>();
  for (const lg of cds.getLecturesForCourse(course)) {
    for (const d of lg.compatibleDiscussions) all.set(d.crn, d);
  }
  return Array.from(all.values());
}

function getAllLabsForCourse(
  course: Course,
  cds: CourseDataService,
): Section[] {
  const all = new Map<number, Section>();
  for (const lg of cds.getLecturesForCourse(course)) {
    for (const l of lg.compatibleLabs) all.set(l.crn, l);
  }
  return Array.from(all.values());
}

/** Group sections by academic term, ordered A->E. */
export function groupSectionsByTerm(
  sections: Section[],
): Array<{ term: string; sections: Section[] }> {
  const grouped = new Map<string, Section[]>();
  for (const section of sections) {
    const term = section.computedTerm || 'Unknown';
    if (!grouped.has(term)) grouped.set(term, []);
    grouped.get(term)!.push(section);
  }

  return Array.from(grouped.entries())
    .sort((a, b) => TERM_ORDER.indexOf(a[0]) - TERM_ORDER.indexOf(b[0]))
    .map(([term, sections]) => ({ term, sections }));
}

export function getTermName(term: string): string {
  return TERM_NAMES[term] || `${term} Term`;
}

/** Async = explicit flag or a 12:00-12:00 placeholder time. */
export function isAsyncPeriod(period: Period | undefined): boolean {
  return Boolean(
    period?.isAsync ||
    (period &&
      period.startTime.hours === 12 &&
      period.startTime.minutes === 0 &&
      period.endTime.hours === 12 &&
      period.endTime.minutes === 0),
  );
}

export function getSeatsInfo(section: Section): string {
  return section.seatsAvailable > 0
    ? `${section.seatsAvailable}/${section.seats} seats remaining`
    : `Full (${section.actualWaitlist}/${section.maxWaitlist} waitlist)`;
}

export function getRmpRatingClass(
  rating: string,
): 'excellent' | 'good' | 'poor' {
  const n = parseFloat(rating);
  return n >= 4.0 ? 'excellent' : n >= 3.0 ? 'good' : 'poor';
}

/**
 * Human-readable descriptions of the active filters, for the filter-status banner.
 * RMP ranges are collapsed into one entry; search text is excluded (shown elsewhere).
 */
export function describeActiveFilters(
  filterService: FilterService | null,
): string[] {
  if (!filterService || filterService.isEmpty()) return [];

  const descriptions: string[] = [];
  for (const filter of filterService.getActiveFilters()) {
    if (filter.id === 'periodRmpRating' && filter.criteria) {
      const c = filter.criteria as {
        minRating?: number;
        maxRating?: number;
        minDifficulty?: number;
        maxDifficulty?: number;
        minWouldTakeAgain?: number;
        maxWouldTakeAgain?: number;
      };
      const parts: string[] = [];
      if ((c.minRating ?? 0) > 0 || (c.maxRating ?? 5) < 5) {
        parts.push(
          `${(c.minRating ?? 0).toFixed(1)}-${(c.maxRating ?? 5).toFixed(1)} rating`,
        );
      }
      if ((c.minDifficulty ?? 0) > 0 || (c.maxDifficulty ?? 5) < 5) {
        parts.push(
          `${(c.minDifficulty ?? 0).toFixed(1)}-${(c.maxDifficulty ?? 5).toFixed(1)} difficulty`,
        );
      }
      if (
        (c.minWouldTakeAgain ?? 0) > 0 ||
        (c.maxWouldTakeAgain ?? 100) < 100
      ) {
        parts.push(
          `${c.minWouldTakeAgain ?? 0}-${c.maxWouldTakeAgain ?? 100}% retake`,
        );
      }
      if (parts.length > 0) descriptions.push(`RMP: ${parts.join(' • ')}`);
    } else if (filter.id !== 'searchText') {
      descriptions.push(filter.name);
    }
  }
  return descriptions;
}

/**
 * If an academic-year filter is active and doesn't match this course, returns the
 * info needed to render the "switch year" notice. Otherwise null.
 */
export function getYearMismatch(
  course: Course,
  filterService: FilterService | null,
): { courseYear: number; filterYear: number } | null {
  if (!filterService || !course.academicYear) return null;
  const yearFilter = filterService
    .getActiveFilters()
    .find(f => f.id === 'academicYear');
  if (!yearFilter) return null;
  const filterYear = (yearFilter.criteria as AcademicYearFilterCriteria).year;
  if (typeof filterYear === 'number' && filterYear !== course.academicYear) {
    return { courseYear: course.academicYear, filterYear };
  }
  return null;
}
