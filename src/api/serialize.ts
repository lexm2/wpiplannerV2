/**
 * JSON shapes the course API and MCP server return. Catalog objects hold Sets
 * and nested parse artifacts, so nothing is sent as-is: lists get the compact
 * CourseSummary (with SectionBriefs of the matching sections on request),
 * single-course lookups the CourseDetail, which lists each section once.
 */
import type { Course, Period, Section, Time } from '../types/types';
import { DayOfWeek } from '../types/types';
import { getAllSections, seatsLabel } from '../utils/courseUtils';
import { TERM_ORDER } from '../utils/typeGuards';
import { TimeUtils } from '../utils/timeUtils';
import { timedPeriods } from '../utils/timeWindows';
import type { RateMyProfessorService } from '../services/external/RateMyProfessorService';
import type { Forecast } from './forecast';

const MAX_SUMMARY_PROFESSORS = 4;
const DAY_ORDER = Object.values(DayOfWeek);

export type SectionKind = 'lecture' | 'discussion' | 'lab' | 'standaloneLab';

interface RatingView {
  rating: number;
  difficulty: number;
  numRatings: number;
  /** Percent; null when RMP lacks enough data. */
  wouldTakeAgain: number | null;
  url: string | null;
}

export interface InstructorView {
  name: string;
  /** Rate My Professor ratings; null when RMP has none for them. */
  rmp: RatingView | null;
}

export interface SeatTotals {
  capacity: number;
  /** Open seats; an over-enrolled section adds nothing. */
  available: number;
  waitlisted: number;
}

/** Seat totals over sections. */
export function seatTotals(sections: Section[]): SeatTotals {
  return {
    capacity: sections.reduce((n, s) => n + s.seats, 0),
    // Over-enrolled sections report a negative count; they add nothing.
    available: sections.reduce((n, s) => n + Math.max(0, s.seatsAvailable), 0),
    waitlisted: sections.reduce((n, s) => n + s.actualWaitlist, 0),
  };
}

export interface CourseSummary {
  id: string;
  /** "CS 2102" */
  code: string;
  name: string;
  department: string;
  credits: { min: number; max: number };
  /** Fall year of the academic year: 2026 is 2026-27. */
  year: number | null;
  /** Terms with at least one section, A-D quarters then F/S semesters. */
  terms: string[];
  /**
   * Totals over the lecture sections (standalone labs for lab-only
   * courses), interest lists left out. In a search, only the sections that
   * matched every filter.
   */
  seats: SeatTotals;
  /** The same totals per term, A-D then F/S, for courses in several terms. */
  seatsByTerm: (SeatTotals & { term: string })[];
  sectionCount: number;
  isGraduate: boolean;
  professors: string[];
  /** WPI offering category: 1 every year, 2 every other year, 3 occasionally. */
  category: 1 | 2 | 3 | null;
  /** Degree requirements its sections count toward, e.g. "Social Sciences". */
  degreeAttributes: string[];
  /** Other codes the same sections are listed under; one class. */
  crossListedWith: string[];
  /**
   * The best-rated lecture instructor with Rate My Professor data. Those
   * with SOLID_RATINGS (5) or more ratings rank above those with fewer,
   * then by rating.
   */
  topInstructor: (Omit<RatingView, 'url'> & { name: string }) | null;
}

/** One section on one line: what a search row lists under its course. */
export interface SectionBrief {
  crn: number;
  number: string;
  term: string;
  kind: SectionKind;
  /** "MTRF 10:00-10:50", "Async" or "TBD"; periods joined by "; ". */
  meets: string;
  location: string;
  instructors: InstructorView[];
  seats: number;
  seatsAvailable: number;
  waitlist: number;
  /** Registration status: "Open", "Waitlist" or "Closed". */
  status: string;
  /** "In-Person", "Online" or "Hybrid". */
  deliveryMode: string;
}

interface PeriodView {
  type: string;
  /** The period's instructors; co-taught periods list several. */
  instructors: InstructorView[];
  /** Weekday letters M T W R F S U, in week order. Empty when async. */
  days: string[];
  /** "HH:MM", 24-hour; null when the period has no set time. */
  start: string | null;
  end: string | null;
  /** e.g. "MWF 10:00-10:50 AM", "Async" or "TBD". */
  display: string;
  location: string;
  isAsync: boolean;
}

export interface SectionView {
  crn: number;
  number: string;
  term: string;
  kind: SectionKind;
  /** For a lab or discussion: the CRNs of the lectures it can go with. */
  pairsWith: number[];
  seats: number;
  seatsAvailable: number;
  waitlist: number;
  maxWaitlist: number;
  /** "12/30 available" or "Full (32/30 enrolled)". */
  seatsLabel: string;
  isInterestList: boolean;
  /** Part of WPI's online graduate offering. */
  isOnlineGrad: boolean;
  /** Other sections, often of another course, meeting with this one. */
  meetsWith: string[];
  /** "In-Person", "Online" or "Hybrid". */
  deliveryMode: string;
  /** Registration status: "Open", "Waitlist" or "Closed". */
  status: string;
  /** First and last day the section meets, YYYY-MM-DD. */
  startDate: string;
  endDate: string;
  periods: PeriodView[];
}

/** A lecture and the companions it can be taken with, by CRN. */
interface LectureGroupRef {
  lecture: number;
  /** Pick one of these alongside the lecture, when any are listed. */
  discussions: number[];
  labs: number[];
}

export interface CourseDetail extends CourseSummary {
  departmentName: string;
  description: string;
  /** e.g. "Special Topic", "Music", "Experimental (Undergrad Courses Only)". */
  courseTypes: string[];
  /** Lifted from the description's prose; still part of it. */
  recommendedBackground: string | null;
  prerequisites: string | null;
  /** Every section shown, once each: per term, lectures first. */
  sections: SectionView[];
  lectureGroups: LectureGroupRef[];
  standaloneLabs: number[];
  /** What the options left out of `sections`. */
  omitted: {
    /** Terms left out because they have ended. */
    endedTerms: string[];
    /** Terms left out because `terms` did not ask for them. */
    otherTerms: string[];
    /** Terms with an interest-list placeholder left out. */
    interestLists: string[];
    /** Sections left out for having no open seat. */
    fullSections: number;
  };
  /** What can be said of next year, while its schedule is unpublished. */
  nextYear: Forecast | null;
}

export interface DetailOptions {
  /** Only these terms; overrides includeEndedTerms. */
  terms?: string[];
  includeEndedTerms?: boolean;
  includeFull?: boolean;
  includeInterestLists?: boolean;
}

export interface DetailContext {
  rmp: RateMyProfessorService;
  /** Terms of the course's year that have ended. */
  endedTerms: string[];
  nextYear: Forecast | null;
}

function isNamedProfessor(name: string): boolean {
  return !!name.trim() && name !== 'TBA' && name !== 'Not Assigned';
}

/** A period's named instructors; co-taught "A; B" splits. */
function instructorNames(period: Period): string[] {
  return period.professor.split(/\s*;\s*/).filter(isNamedProfessor);
}

/** Instructor names in order of first appearance. */
function professorsOf(sections: Section[]): string[] {
  const names = new Set<string>();
  for (const section of sections) {
    for (const period of section.periods) {
      for (const name of instructorNames(period)) names.add(name);
    }
  }
  return [...names];
}

const termRank = (t: string) => {
  const i = TERM_ORDER.indexOf(t);
  return i === -1 ? TERM_ORDER.length : i;
};

/** The sections' terms, A-D quarters then F/S semesters. */
export function termsOf(sections: Section[]): string[] {
  const terms = new Set(sections.map(s => s.computedTerm).filter(Boolean));
  return [...terms].sort((a, b) => termRank(a) - termRank(b));
}

export function courseCode(course: Course): string {
  return `${course.departmentAbbr} ${course.number}`;
}

/** The sections a student enrolls in first: lectures, else standalone labs. */
export function primarySections(course: Course): Section[] {
  const primary = course.lectures?.length
    ? course.lectures.map(g => g.section)
    : (course.standaloneLabs ?? []);
  return primary.filter(s => !s.isInterestList);
}

type RatingLookup = (name: string) => RatingView | null;

function ratingLookup(rmp: RateMyProfessorService): RatingLookup {
  return name => {
    const r = rmp.getRatings(name);
    if (!r) return null;
    return {
      ...r,
      // RMP reports -1 when too few raters answered.
      wouldTakeAgain:
        r.wouldTakeAgain !== null && r.wouldTakeAgain >= 0
          ? r.wouldTakeAgain
          : null,
      url: rmp.getProfessorRMPUrl(name),
    };
  };
}

/**
 * Instructors with at least this many ratings outrank those with fewer:
 * 4.7 from 3 reviews says less than 3.9 from 24, and 5.0 from one review
 * almost nothing.
 */
export const SOLID_RATINGS = 5;

function topInstructor(sections: Section[], ratingOf: RatingLookup) {
  let best: CourseSummary['topInstructor'] = null;
  const solid = (n: number) => n >= SOLID_RATINGS;
  for (const name of professorsOf(sections)) {
    const r = ratingOf(name);
    if (!r) continue;
    const better =
      !best ||
      (solid(r.numRatings) && !solid(best.numRatings)) ||
      (solid(r.numRatings) === solid(best.numRatings) &&
        (r.rating > best.rating ||
          (r.rating === best.rating && r.numRatings > best.numRatings)));
    if (better) {
      best = {
        name,
        rating: r.rating,
        difficulty: r.difficulty,
        wouldTakeAgain: r.wouldTakeAgain,
        numRatings: r.numRatings,
      };
    }
  }
  return best;
}

export function toCourseSummary(
  course: Course,
  rmp: RateMyProfessorService,
): CourseSummary {
  const primary = primarySections(course);
  const all = getAllSections(course).filter(s => !s.isInterestList);

  return {
    id: course.id,
    code: courseCode(course),
    name: course.name,
    department: course.departmentAbbr,
    credits: { min: course.minCredits, max: course.maxCredits },
    year: course.academicYear ?? null,
    terms: termsOf(all),
    seats: seatTotals(primary),
    seatsByTerm: termsOf(primary).map(term => ({
      term,
      ...seatTotals(primary.filter(s => (s.computedTerm as string) === term)),
    })),
    sectionCount: primary.length,
    isGraduate: course.isGraduate ?? false,
    professors: professorsOf(primary).slice(0, MAX_SUMMARY_PROFESSORS),
    category: course.category ?? null,
    degreeAttributes: course.degreeAttributes,
    crossListedWith: course.crossListedWith,
    topInstructor: topInstructor(primary, ratingLookup(rmp)),
  };
}

function hhmm(time: Time): string {
  return `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`;
}

function toPeriodView(
  period: Period,
  timed: boolean,
  ratingOf: RatingLookup,
): PeriodView {
  const days = DAY_ORDER.filter(d => period.days.has(d));
  const hasTime = period.startTime.displayTime !== 'TBD';
  let display: string;
  if (period.isAsync) display = 'Async';
  else if (!timed || !hasTime) display = 'TBD';
  else
    display = `${days.join('')} ${TimeUtils.formatTimeRange(period.startTime, period.endTime)}`;

  return {
    type: period.type,
    instructors: instructorNames(period).map(name => ({
      name,
      rmp: ratingOf(name),
    })),
    days: period.isAsync ? [] : days,
    start: timed && hasTime ? hhmm(period.startTime) : null,
    end: timed && hasTime ? hhmm(period.endTime) : null,
    display,
    location: period.location,
    isAsync: period.isAsync ?? false,
  };
}

/** "MTRF 10:00-10:50", one entry per period, "Async" or "TBD" untimed. */
function meetingText(section: Section): string {
  const timed = new Set(timedPeriods(section));
  const parts = section.periods.map(p => {
    if (p.isAsync) return 'Async';
    if (!timed.has(p) || p.startTime.displayTime === 'TBD') return 'TBD';
    const days = DAY_ORDER.filter(d => p.days.has(d)).join('');
    return `${days} ${hhmm(p.startTime)}-${hhmm(p.endTime)}`;
  });
  return [...new Set(parts)].join('; ') || 'TBD';
}

function locationText(section: Section): string {
  return [
    ...new Set(section.periods.map(p => p.location).filter(Boolean)),
  ].join('; ');
}

function instructorsOf(
  section: Section,
  ratingOf: RatingLookup,
): InstructorView[] {
  return professorsOf([section]).map(name => ({ name, rmp: ratingOf(name) }));
}

export function toSectionBrief(
  section: Section,
  kind: SectionKind,
  rmp: RateMyProfessorService,
): SectionBrief {
  return {
    crn: section.crn,
    number: section.number,
    term: section.computedTerm,
    kind,
    meets: meetingText(section),
    location: locationText(section),
    instructors: instructorsOf(section, ratingLookup(rmp)),
    seats: section.seats,
    seatsAvailable: section.seatsAvailable,
    waitlist: section.actualWaitlist,
    status: section.status,
    deliveryMode: section.deliveryMode,
  };
}

function toSectionView(
  section: Section,
  kind: SectionKind,
  pairsWith: number[],
  ratingOf: RatingLookup,
): SectionView {
  const timed = new Set(timedPeriods(section));
  return {
    crn: section.crn,
    number: section.number,
    term: section.computedTerm,
    kind,
    pairsWith,
    seats: section.seats,
    seatsAvailable: section.seatsAvailable,
    waitlist: section.actualWaitlist,
    maxWaitlist: section.maxWaitlist,
    seatsLabel: seatsLabel(section),
    isInterestList: section.isInterestList ?? false,
    isOnlineGrad: section.isOnlineGrad,
    meetsWith: section.meetsWith,
    deliveryMode: section.deliveryMode,
    status: section.status,
    startDate: section.startDate,
    endDate: section.endDate,
    periods: section.periods.map(p => toPeriodView(p, timed.has(p), ratingOf)),
  };
}

const KIND_RANK: Record<SectionKind, number> = {
  lecture: 0,
  standaloneLab: 1,
  discussion: 2,
  lab: 3,
};

/**
 * The course with each section once, trimmed by `options`: a lab open to
 * five lectures is one entry that lists the five, where the catalog repeats
 * it under each.
 */
export function toCourseDetail(
  course: Course,
  context: DetailContext,
  options: DetailOptions = {},
): CourseDetail {
  const ratingOf = ratingLookup(context.rmp);
  const ended = new Set(context.endedTerms);
  const allTerms = termsOf(getAllSections(course));
  const omitted: CourseDetail['omitted'] = {
    endedTerms: [],
    otherTerms: [],
    interestLists: [],
    fullSections: 0,
  };

  const termShown = (term: string) =>
    options.terms
      ? options.terms.includes(term)
      : (options.includeEndedTerms ?? true) || !ended.has(term);
  for (const term of allTerms) {
    if (termShown(term)) continue;
    if (options.terms) omitted.otherTerms.push(term);
    else omitted.endedTerms.push(term);
  }

  const counted = new Set<number>();
  const shown = (section: Section) => {
    if (!termShown(section.computedTerm)) return false;
    if (section.isInterestList && !(options.includeInterestLists ?? true)) {
      if (!omitted.interestLists.includes(section.computedTerm)) {
        omitted.interestLists.push(section.computedTerm);
      }
      return false;
    }
    if (section.seatsAvailable <= 0 && !(options.includeFull ?? true)) {
      if (!counted.has(section.crn)) omitted.fullSections++;
      counted.add(section.crn);
      return false;
    }
    return true;
  };

  // CRN -> section, its kind, and the lectures a companion pairs with.
  const entries = new Map<
    number,
    { section: Section; kind: SectionKind; pairs: number[] }
  >();
  const add = (section: Section, kind: SectionKind, lecture?: number) => {
    let entry = entries.get(section.crn);
    if (!entry) {
      entry = { section, kind, pairs: [] };
      entries.set(section.crn, entry);
    }
    if (lecture !== undefined && !entry.pairs.includes(lecture)) {
      entry.pairs.push(lecture);
    }
  };

  const lectureGroups: LectureGroupRef[] = [];
  for (const group of course.lectures ?? []) {
    if (!shown(group.section)) continue;
    const lecture = group.section.crn;
    add(group.section, 'lecture');
    const discussions = group.compatibleDiscussions.filter(shown);
    const labs = group.compatibleLabs.filter(shown);
    for (const d of discussions) add(d, 'discussion', lecture);
    for (const l of labs) add(l, 'lab', lecture);
    lectureGroups.push({
      lecture,
      discussions: discussions.map(d => d.crn),
      labs: labs.map(l => l.crn),
    });
  }
  const standaloneLabs = (course.standaloneLabs ?? []).filter(shown);
  for (const lab of standaloneLabs) add(lab, 'standaloneLab');

  const sections = [...entries.values()]
    .sort(
      (a, b) =>
        termRank(a.section.computedTerm) - termRank(b.section.computedTerm) ||
        KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
        a.section.number.localeCompare(b.section.number),
    )
    .map(e => toSectionView(e.section, e.kind, e.pairs, ratingOf));

  return {
    ...toCourseSummary(course, context.rmp),
    departmentName: course.departmentName,
    description: course.description,
    courseTypes: course.courseTypes,
    recommendedBackground: course.recommendedBackground ?? null,
    prerequisites: course.prerequisites ?? null,
    sections,
    lectureGroups,
    standaloneLabs: standaloneLabs.map(l => l.crn),
    omitted,
    nextYear: context.nextYear,
  };
}
