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
import type { StudentRecord } from '../../types/degree';
import type { Course, Department, Section } from '../../types/types';
import type { SelectedCourse } from '../../types/schedule';
import { academicYearForPeriod, findCatalogCourse } from './catalogLookup';

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

        // Plan-building needs the exact academic year for term pinning, so no
        // newest-year fallback here.
        const course: Course | null = findCatalogCourse(pc.code, ay, departments, { fallbackToNewest: false });
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
