/**
 * JSON shapes the course API and MCP server return. Catalog objects hold Sets
 * and nested parse artifacts, so nothing is sent as-is: lists get the compact
 * CourseSummary, single-course lookups the full CourseDetail.
 */
import type { Course, Period, Section, Time } from '../types/types';
import { DayOfWeek } from '../types/types';
import { getAllSections, seatsLabel } from '../utils/courseUtils';
import { TERM_ORDER } from '../utils/typeGuards';
import { TimeUtils } from '../utils/timeUtils';
import { timedPeriods } from '../utils/timeWindows';
import type { RateMyProfessorService } from '../services/external/RateMyProfessorService';

const MAX_SUMMARY_PROFESSORS = 4;
const DAY_ORDER = Object.values(DayOfWeek);

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
  /** Totals over the lecture sections (standalone labs for lab-only courses). */
  seats: { capacity: number; available: number; waitlisted: number };
  sectionCount: number;
  isGraduate: boolean;
  professors: string[];
}

interface PeriodView {
  type: string;
  professor: string;
  /** The professor field split per instructor ("A; B" is co-taught). */
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

interface SectionView {
  crn: number;
  number: string;
  term: string;
  seats: number;
  seatsAvailable: number;
  waitlist: number;
  maxWaitlist: number;
  /** "12/30 available" or "Full (32/30 enrolled)". */
  seatsLabel: string;
  isInterestList: boolean;
  periods: PeriodView[];
}

interface LectureGroupView {
  lecture: SectionView;
  /** Pick one of these alongside the lecture, when any are listed. */
  discussions: SectionView[];
  labs: SectionView[];
}

interface InstructorView {
  name: string;
  /** Rate My Professor ratings; null when RMP has none for them. */
  rmp: RatingView | null;
}

interface RatingView {
  rating: number;
  difficulty: number;
  numRatings: number;
  /** Percent; null when RMP lacks enough data. */
  wouldTakeAgain: number | null;
  url: string | null;
}

export interface CourseDetail extends CourseSummary {
  departmentName: string;
  description: string;
  lectureGroups: LectureGroupView[];
  standaloneLabs: SectionView[];
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

function termsOf(sections: Section[]): string[] {
  const terms = new Set(sections.map(s => s.computedTerm).filter(Boolean));
  const rank = (t: string) => {
    const i = TERM_ORDER.indexOf(t);
    return i === -1 ? TERM_ORDER.length : i;
  };
  return [...terms].sort((a, b) => rank(a) - rank(b));
}

export function courseCode(course: Course): string {
  return `${course.departmentAbbr} ${course.number}`;
}

export function toCourseSummary(course: Course): CourseSummary {
  const all = getAllSections(course);
  const primary = course.lectures?.length
    ? course.lectures.map(g => g.section)
    : (course.standaloneLabs ?? []);

  return {
    id: course.id,
    code: courseCode(course),
    name: course.name,
    department: course.departmentAbbr,
    credits: { min: course.minCredits, max: course.maxCredits },
    year: course.academicYear ?? null,
    terms: termsOf(all),
    seats: {
      capacity: primary.reduce((n, s) => n + s.seats, 0),
      // Over-enrolled sections report a negative count; they add nothing.
      available: primary.reduce((n, s) => n + Math.max(0, s.seatsAvailable), 0),
      waitlisted: primary.reduce((n, s) => n + s.actualWaitlist, 0),
    },
    sectionCount: primary.length,
    isGraduate: course.isGraduate ?? false,
    professors: professorsOf(primary).slice(0, MAX_SUMMARY_PROFESSORS),
  };
}

function hhmm(time: Time): string {
  return `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`;
}

type RatingLookup = (name: string) => RatingView | null;

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
    professor: period.professor,
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

function toSectionView(section: Section, ratingOf: RatingLookup): SectionView {
  const timed = new Set(timedPeriods(section));
  return {
    crn: section.crn,
    number: section.number,
    term: section.computedTerm,
    seats: section.seats,
    seatsAvailable: section.seatsAvailable,
    waitlist: section.actualWaitlist,
    maxWaitlist: section.maxWaitlist,
    seatsLabel: seatsLabel(section),
    isInterestList: section.isInterestList ?? false,
    periods: section.periods.map(p => toPeriodView(p, timed.has(p), ratingOf)),
  };
}

export function toCourseDetail(
  course: Course,
  rmp: RateMyProfessorService,
): CourseDetail {
  const ratingOf: RatingLookup = name => {
    const r = rmp.getRatings(name);
    return r ? { ...r, url: rmp.getProfessorRMPUrl(name) } : null;
  };
  const view = (section: Section) => toSectionView(section, ratingOf);

  return {
    ...toCourseSummary(course),
    departmentName: course.departmentName,
    description: course.description,
    lectureGroups: (course.lectures ?? []).map(g => ({
      lecture: view(g.section),
      discussions: g.compatibleDiscussions.map(view),
      labs: g.compatibleLabs.map(view),
    })),
    standaloneLabs: (course.standaloneLabs ?? []).map(view),
  };
}
