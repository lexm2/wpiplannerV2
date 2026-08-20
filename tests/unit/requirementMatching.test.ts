import { describe, it, expect } from 'vitest';
import {
    inferRequirementDepartments,
    matchScheduleToRequirements,
    computePlacements,
    type ScheduleMatch,
} from '../../src/services/degree/requirementMatching';
import { findCatalogCourse, candidateCodes } from '../../src/services/degree/catalogLookup';
import type { AppliedCourse, Requirement, RequirementCategory, RequirementStatus, StudentRecord } from '../../src/types/degree';
import type { Course, Department } from '../../src/types/types';
import type { SelectedCourse } from '../../src/types/schedule';

// --- builders ---------------------------------------------------------------

function applied(code: string): AppliedCourse {
    const [department, number] = code.split(' ');
    return {
        code, department, number, title: code, credits: 3, grade: 'A',
        isTransfer: false, isInProgress: false, period: null, satisfies: [],
    };
}

function req(
    rawName: string,
    category: RequirementCategory,
    opts: { scope?: string; status?: RequirementStatus; applied?: string[] } = {},
): Requirement {
    return {
        rawName,
        category,
        scope: opts.scope ?? '',
        name: rawName,
        status: opts.status ?? 'not_satisfied',
        creditsRequired: null,
        creditsRemaining: null,
        coursesRemaining: null,
        appliedCourses: (opts.applied ?? []).map(applied),
    };
}

function record(reqs: Requirement[]): StudentRecord {
    return {
        schemaVersion: 1, major: 'Computer Science', degree: 'BS', startYear: 2025, importedAt: 'x',
        requirements: reqs, courses: [], credits: { earned: 0, inProgress: 0, transfer: 0, required: null },
    };
}

function course(dept: string, number: string): Course {
    return {
        id: `${dept}-${number}-2026`, number, name: `${dept} ${number}`, description: '',
        departmentAbbr: dept, departmentName: dept, lectures: [], minCredits: 3, maxCredits: 3, academicYear: 2026,
    };
}

function selected(...courses: Course[]): SelectedCourse[] {
    return courses.map(c => ({
        course: c, selected: {},
        isRequired: true, lockedSections: new Set<string>(),
    }));
}

const departments: Department[] = [
    { abbreviation: 'CS', name: 'Computer Science', courses: [] },
    { abbreviation: 'WPE', name: 'Physical Education', courses: [] },
    { abbreviation: 'HU', name: 'Humanities', courses: [] },
];

// --- inferRequirementDepartments --------------------------------------------

describe('inferRequirementDepartments', () => {
    it('returns applied departments most-common first', () => {
        const r = req('CS Core', 'major_specific', { applied: ['CS 1101', 'CS 2102', 'MA 1021'] });
        expect(inferRequirementDepartments(r, departments)).toEqual(['CS', 'MA']);
    });

    it('falls back to WPE for physical education when nothing applied', () => {
        expect(inferRequirementDepartments(req('Phys Ed', 'physical_education'), departments)).toEqual(['WPE']);
    });

    it('maps a major_specific scope name to its abbreviation', () => {
        const r = req('Core', 'major_specific', { scope: 'Computer Science' });
        expect(inferRequirementDepartments(r, departments)).toEqual(['CS']);
    });

    it('returns [] for broad gen-ed buckets with no applied courses', () => {
        expect(inferRequirementDepartments(req('Humanities & Arts', 'hua'), departments)).toEqual([]);
    });
});

// --- matchScheduleToRequirements --------------------------------------------

describe('matchScheduleToRequirements', () => {
    it('exact-matches a schedule course whose code is already listed under a requirement', () => {
        const rec = record([req('CS Core', 'major_specific', { applied: ['CS 3013'] })]);
        const m = matchScheduleToRequirements(rec, selected(course('CS', '3013')), departments);
        expect(m.get('CS Core')).toEqual([
            { courseId: 'CS-3013-2026', code: 'CS 3013', title: 'CS 3013', credits: 3, confidence: 'exact' },
        ]);
    });

    it('heuristically buckets an unlisted course by department into an unsatisfied requirement', () => {
        const rec = record([req('CS Core', 'major_specific', { applied: ['CS 1101'] })]);
        const m = matchScheduleToRequirements(rec, selected(course('CS', '4341')), departments);
        const entry = m.get('CS Core')?.[0];
        expect(entry).toMatchObject({ courseId: 'CS-4341-2026', confidence: 'heuristic' });
    });

    it('prefers major-specific over free-electives for a heuristic match', () => {
        const rec = record([
            req('Free Electives', 'free_electives', { applied: ['CS 1000'] }),
            req('CS Core', 'major_specific', { applied: ['CS 1101'] }),
        ]);
        const m = matchScheduleToRequirements(rec, selected(course('CS', '4341')), departments);
        expect(m.get('CS Core')?.length).toBe(1);
        expect(m.has('Free Electives')).toBe(false);
    });

    it('does not bucket into already-satisfied requirements (heuristic)', () => {
        const rec = record([req('CS Core', 'major_specific', { status: 'satisfied', applied: ['CS 1101'] })]);
        const m = matchScheduleToRequirements(rec, selected(course('CS', '4341')), departments);
        expect(m.size).toBe(0);
    });
});

// --- computePlacements ------------------------------------------------------

function planned(code: string): AppliedCourse {
    return { ...applied(code), grade: null, isInProgress: true, period: { year: 2026, season: 'Fall', term: 'A', raw: '2026 Fall A Term' } };
}

describe('computePlacements', () => {
    const base: ScheduleMatch = new Map([
        ['CS Core', [{ courseId: 'CS-4341-2026', code: 'CS 4341', title: 'AI', credits: 3, confidence: 'heuristic' }]],
    ]);

    it('makes in-progress (planned) courses draggable tiles, ignoring completed ones', () => {
        const rec = record([req('CS Core', 'major_specific', { applied: ['CS 1101'] })]);
        rec.requirements[0].appliedCourses.push(planned('CS 3733'));
        const out = computePlacements(rec, null, {});
        const tiles = out.get('CS Core') ?? [];
        expect(tiles).toHaveLength(1); // only the planned course, not the graded CS 1101
        expect(tiles[0]).toMatchObject({ kind: 'planned', code: 'CS 3733', confidence: null });
    });

    it('includes schedule overlay tiles when a match is provided', () => {
        const out = computePlacements(record([]), base, {});
        expect(out.get('CS Core')?.[0]).toMatchObject({ kind: 'schedule', code: 'CS 4341', confidence: 'heuristic' });
    });

    it('moves a schedule tile to its target and tags it manual', () => {
        const out = computePlacements(record([]), base, { 'sched:CS-4341-2026:CS Core': 'Free Electives' });
        expect(out.has('CS Core')).toBe(false);
        expect(out.get('Free Electives')?.[0]).toMatchObject({ code: 'CS 4341', confidence: 'manual', moved: true });
    });

    it('tags planned tiles with their catalog academic year (Spring → previous fall)', () => {
        const rec = record([req('CS Core', 'major_specific')]);
        rec.requirements[0].appliedCourses.push({ ...planned('CS 3733'), period: { year: 2027, season: 'Spring', term: 'C', raw: '2027 Spring C Term' } });
        const tile = computePlacements(rec, null, {}).get('CS Core')?.[0];
        expect(tile?.year).toBe(2026);
    });

    it('moves a planned tile to another requirement', () => {
        const rec = record([
            req('CS Core', 'major_specific'),
            req('Free Electives', 'free_electives'),
        ]);
        rec.requirements[0].appliedCourses.push(planned('CS 3733'));
        const key = 'planned:CS 3733:2026 Fall A Term:CS Core';
        const out = computePlacements(rec, null, { [key]: 'Free Electives' });
        expect(out.has('CS Core')).toBe(false);
        expect(out.get('Free Electives')?.[0]).toMatchObject({ kind: 'planned', code: 'CS 3733', moved: true });
    });
});

// --- findCatalogCourse ------------------------------------------------------

describe('candidateCodes', () => {
    it('parses spaced, unspaced, and cross-listed codes', () => {
        expect(candidateCodes('CS 3013')).toEqual([{ dept: 'CS', number: '3013' }]);
        expect(candidateCodes('CS3013')).toEqual([{ dept: 'CS', number: '3013' }]);
        expect(candidateCodes('CS 2022/ MA 2201')).toEqual([{ dept: 'CS', number: '2022' }, { dept: 'MA', number: '2201' }]);
    });
});

describe('findCatalogCourse', () => {
    const depts: Department[] = [{
        abbreviation: 'CS', name: 'Computer Science',
        courses: [course('CS', '3013'), { ...course('CS', '3013'), id: 'CS-3013-2024', academicYear: 2024 }],
    }, {
        abbreviation: 'MA', name: 'Mathematics', courses: [course('MA', '2201')],
    }];

    it('prefers the requested year', () => {
        expect(findCatalogCourse('CS 3013', 2024, depts)?.id).toBe('CS-3013-2024');
    });

    it('falls back to the newest matching year when the requested one is absent', () => {
        expect(findCatalogCourse('CS 3013', 2099, depts)?.id).toBe('CS-3013-2026');
    });

    it('resolves a cross-listed alternate', () => {
        expect(findCatalogCourse('CS 9999/ MA 2201', 2026, depts)?.id).toBe('MA-2201-2026');
    });

    it('returns null when nothing matches', () => {
        expect(findCatalogCourse('XX 1234', 2026, depts)).toBeNull();
    });
});
