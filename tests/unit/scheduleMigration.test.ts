/**
 * The read-time storage migration, run against a capture of the real on-disk
 * shape (`tests/fixtures/legacy-schedules.json`).
 *
 * Standalone by design: the fixture is plain JSON, and the only things under
 * test are `migrateStoredSchedule` and the Set replacer/reviver pair. No
 * IndexedDB, no LZString, no worker, no ProfileStateManager, no import/export
 * path. If this file needs the app booted to run, the migration has stopped
 * being a pure function and that is itself the bug.
 *
 * The fixture was captured by dumping the `schedules` object store of a real
 * profile and decompressing `serializedData`; the pre-2.0 and edge-case rows
 * were derived from those same real courses. Rows carry `schemaVersion`
 * undefined, i.e. written before stamping existed — the case every current user
 * is in.
 */
import { describe, it, expect } from 'vitest';
import {
    migrateStoredSchedule,
    SCHEDULE_SCHEMA_VERSION,
} from '../../src/core/storage/scheduleMigration';
import { setReplacer, setReviver } from '../../src/utils/jsonSerializer';
import fixture from '../fixtures/legacy-schedules.json';

type Row = { id: string; timestamp: number; compressed: boolean; schedule: unknown };

const rows = fixture as unknown as Row[];
const rowById = (id: string) => rows.find(r => r.id.startsWith(id))!;

/** Re-hydrates a fixture row the way the storage layer does, Sets and all. */
function revive(row: Row): Record<string, any> {
    return JSON.parse(JSON.stringify(row.schedule), setReviver);
}

function migrate(row: Row, version?: number): Record<string, any> {
    return migrateStoredSchedule(revive(row), version) as Record<string, any>;
}

const courseById = (schedule: Record<string, any>, id: string) =>
    schedule.selectedCourses.find((sc: any) => sc.course.id === id);

describe('migrateStoredSchedule', () => {
    it('preserves every component selection in a real captured profile', () => {
        const out = migrate(rowById('schedule_1781409321359'));
        const num = (sc: any, k: string) => sc[k]?.number ?? null;

        // One course per selection shape the wizard can produce.
        expect(
            out.selectedCourses.map((sc: any) => [
                sc.course.id,
                num(sc, 'selectedLecture'),
                num(sc, 'selectedDiscussion'),
                num(sc, 'selectedLab'),
            ]),
        ).toEqual([
            ['CH-1010-2025', 'AL01', 'AD02', 'AX02'], // lecture + discussion + lab
            ['AE-2320-2025', 'CL01', null, 'CX01'],   // lecture + lab
            ['BB-2920-2025', 'A01', 'CD01', null],    // lecture + discussion
            ['AB-1531-2025', 'A01', null, null],      // lecture only
            ['BB-1801-2025', null, null, 'BX01'],     // standalone lab, no lecture
            ['CS-1101-2025', null, null, null],       // selected, nothing picked
        ]);
    });

    it('carries through the fields that are not selections', () => {
        const out = migrate(rowById('schedule_1781409321359'));
        const ch = courseById(out, 'CH-1010-2025');

        expect(ch.customColor).toBe('#ff8800');
        expect(ch.lockedSections).toBeInstanceOf(Set);
        expect([...ch.lockedSections]).toEqual(['334625']);
        expect(ch.course.lectures.length).toBeGreaterThan(0);

        // Schedule-level fields the migration has no business touching.
        expect(out.name).toBe('My Schedule');
        expect(out.year).toBe(2026);
        expect(out.localEvents).toEqual([]);
        expect(out.generatedSchedules).toEqual([]);
    });

    it('preserves allowedTerms, isRequired and a stale CRN', () => {
        const out = migrate(rowById('schedule_edge_cases'));

        const pinned = courseById(out, 'AE-2320-2025');
        expect(pinned.isRequired).toBe(true);
        expect(pinned.allowedTerms).toEqual(['C']);

        // A section whose CRN no longer exists in the catalog is not the
        // migration's problem — resolveCourseReferences drops it later.
        const stale = courseById(out, 'BB-2920-2025');
        expect(stale.selectedLecture.crn).toBe(999999);
        expect(stale.customColor).toBe('#00b3a4');
    });

    it('leaves a course with no selection fields at all alone', () => {
        const out = migrate(rowById('schedule_edge_cases'));
        const corrupt = out.selectedCourses[2];

        expect(corrupt.course.id).toBe('AB-1531-2025');
        expect(corrupt.isRequired).toBe(false);
        expect('selectedLecture' in corrupt).toBe(false);
        expect('selected' in corrupt).toBe(false);
    });

    describe('pre-2.0 selectedSection', () => {
        it('becomes the lecture when the course has lectures', () => {
            const out = migrate(rowById('schedule_legacy_pre2'));
            const hier = courseById(out, 'AB-1531-2025');

            expect(hier.course.lectures.length).toBeGreaterThan(0);
            expect(hier.selectedLecture?.number).toBe('A01');
            expect(hier.selectedLab).toBeNull();
            expect('selectedSection' in hier).toBe(false);
        });

        it('becomes the lab when the course is lab-only', () => {
            const out = migrate(rowById('schedule_legacy_pre2'));
            const labOnly = courseById(out, 'BB-1801-2025');

            expect(labOnly.course.lectures?.length ?? 0).toBe(0);
            expect(labOnly.selectedLab?.number).toBe('BX01');
            expect(labOnly.selectedLecture).toBeNull();
            expect('selectedSection' in labOnly).toBe(false);
            // The upgrade must not cost the course its locks.
            expect([...labOnly.lockedSections]).toEqual(['999001']);
        });

        it('is idempotent', () => {
            const once = migrate(rowById('schedule_legacy_pre2'));
            const twice = migrateStoredSchedule(once);
            expect(twice).toEqual(once);
        });
    });

    describe('version stamp', () => {
        it('skips rows already stamped at the current version', () => {
            const revived = revive(rowById('schedule_legacy_pre2'));
            const out = migrateStoredSchedule(revived, SCHEDULE_SCHEMA_VERSION);

            // Short-circuited, so the pre-2.0 field is still sitting there.
            expect(out).toBe(revived);
            expect('selectedSection' in (out as any).selectedCourses[0]).toBe(true);
        });

        it('migrates rows stamped older than the current version', () => {
            const out = migrateStoredSchedule(
                revive(rowById('schedule_legacy_pre2')),
                SCHEDULE_SCHEMA_VERSION - 1,
            ) as Record<string, any>;
            expect('selectedSection' in out.selectedCourses[0]).toBe(false);
        });

        it('treats an unstamped row as the oldest possible', () => {
            const out = migrate(rowById('schedule_legacy_pre2'), undefined);
            expect('selectedSection' in out.selectedCourses[0]).toBe(false);
        });
    });

    describe('robustness', () => {
        it('passes through a schedule with no courses', () => {
            const out = migrate(rowById('tutorial_'));
            expect(out.selectedCourses).toEqual([]);
            expect(out.name).toBe('Tutorial');
        });

        it('never throws on input it cannot understand', () => {
            for (const junk of [null, undefined, 42, 'nope', [], {}, { selectedCourses: 'no' }]) {
                expect(() => migrateStoredSchedule(junk)).not.toThrow();
            }
            expect(migrateStoredSchedule({ selectedCourses: [null, 7] } as any)).toEqual({
                selectedCourses: [null, 7],
            });
        });
    });

    /**
     * The regression guard for the whole storage design: everything the
     * migration produces has to survive the replacer/reviver pair unchanged.
     * jsonSerializer knows about `Set` and nothing else, so a Map-shaped field
     * would stringify to `{}` and revive as an empty object — silently, at five
     * separate boundaries (storage worker, IDB load, undo/redo, deepClone,
     * tutorial snapshots). This assertion is what makes that unrepresentable.
     */
    it('round-trips through the Set replacer/reviver unchanged', () => {
        for (const row of rows) {
            const migrated = migrateStoredSchedule(revive(row));
            const roundTripped = JSON.parse(JSON.stringify(migrated, setReplacer), setReviver);
            expect(roundTripped).toEqual(migrated);
        }
    });

    it('keeps Sets as Sets across that round trip', () => {
        const migrated = migrate(rowById('schedule_1781409321359'));
        const roundTripped = JSON.parse(JSON.stringify(migrated, setReplacer), setReviver);
        const ch = courseById(roundTripped, 'CH-1010-2025');

        expect(ch.lockedSections).toBeInstanceOf(Set);
        expect([...ch.lockedSections]).toEqual(['334625']);
        // Sets are pervasive deeper in the graph too, not just on lockedSections.
        expect(ch.selectedLecture.periods[0].days).toBeInstanceOf(Set);
    });
});
