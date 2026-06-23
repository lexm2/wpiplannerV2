/**
 * Matches the *planned* courses from an imported academic-progress record
 * (Workday's `(In Progress)` rows) against the loaded course catalog, producing
 * SelectedCourse entries ready to drop into a schedule.
 *
 * The export only tells us the term (A/B/C/D), not the section. So we auto-select
 * the section only when the course has exactly one lecture group in the planned
 * term; otherwise we pin the course to its term (allowedTerms) and leave the
 * section for the user / auto-scheduler. Pure (no service/state deps) so it's
 * unit-testable.
 */
import type { AppliedCourse, StudentRecord } from '../../types/degree';
import type { Course, Department, Section } from '../../types/types';
import type { SelectedCourse } from '../../types/schedule';
import { findCourseById } from '../../types/ScheduleState';

export interface PlanMatchResult {
    selections: SelectedCourse[];
    /** The dominant academic year among matches (for Schedule.year). */
    year?: number;
    stats: {
        matched: number;
        autoSectioned: number;
        pinnedOnly: number;
        unmatched: string[];
    };
}

/**
 * Catalog `academicYear` is the fall year of the academic year. A planned course
 * gives a calendar year + season: Fall terms share that year, Spring terms
 * (C/D) belong to the previous fall year.
 */
export function academicYearForPeriod(period: AppliedCourse['period']): number | null {
    if (!period || !Number.isFinite(period.year)) return null;
    return period.season === 'Spring' ? period.year - 1 : period.year;
}

/** Candidate {dept, number} pairs, handling cross-listed codes like "CS 2022/ MA 2201". */
export function candidateCodes(course: AppliedCourse): { dept: string; number: string }[] {
    const out: { dept: string; number: string }[] = [];
    for (const part of course.code.split('/')) {
        const m = /^\s*([A-Za-z]+)\s+([A-Za-z0-9]+)\s*$/.exec(part);
        if (m) out.push({ dept: m[1].toUpperCase(), number: m[2] });
    }
    // Always include the already-parsed primary as a fallback.
    if (!out.length && course.department && course.number) {
        out.push({ dept: course.department, number: course.number });
    }
    return out;
}

/** A graduate F section covers A/B; S covers C/D. */
function termMatches(computed: string, planned: string): boolean {
    if (computed === planned) return true;
    if (computed === 'F') return planned === 'A' || planned === 'B';
    if (computed === 'S') return planned === 'C' || planned === 'D';
    return false;
}

export function matchPlannedCourses(record: StudentRecord, departments: Department[]): PlanMatchResult {
    const planned = record.courses.filter(c => c.isInProgress);
    const selections: SelectedCourse[] = [];
    const unmatched: string[] = [];
    const yearVotes = new Map<number, number>();
    let autoSectioned = 0;
    let pinnedOnly = 0;

    for (const pc of planned) {
        const ay = academicYearForPeriod(pc.period);

        let course: Course | null = null;
        if (ay !== null) {
            for (const { dept, number } of candidateCodes(pc)) {
                course = findCourseById(`${dept}-${number}-${ay}`, departments);
                if (course) break;
            }
        }
        if (!course) {
            unmatched.push(pc.code);
            continue;
        }
        if (ay !== null) yearVotes.set(ay, (yearVotes.get(ay) ?? 0) + 1);

        const term = pc.period?.term ?? null;
        let selectedLecture: Section | null = null;
        let selectedDiscussion: Section | null = null;
        let selectedLab: Section | null = null;

        if (term) {
            const groups = (course.lectures ?? []).filter(g => termMatches(g.section.computedTerm, term));
            if (groups.length === 1) {
                selectedLecture = groups[0].section;
                if (groups[0].compatibleDiscussions.length === 1) selectedDiscussion = groups[0].compatibleDiscussions[0];
                if (groups[0].compatibleLabs.length === 1) selectedLab = groups[0].compatibleLabs[0];
            }
        }

        if (selectedLecture) autoSectioned++;
        else pinnedOnly++;

        selections.push({
            course,
            selectedLecture,
            selectedDiscussion,
            selectedLab,
            isRequired: true,
            lockedSections: new Set<string>(),
            allowedTerms: term ? [term] : undefined,
        });
    }

    let year: number | undefined;
    let best = -1;
    for (const [y, c] of yearVotes) {
        if (c > best) {
            best = c;
            year = y;
        }
    }

    return { selections, year, stats: { matched: selections.length, autoSectioned, pinnedOnly, unmatched } };
}
