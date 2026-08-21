/**
 * Read-time migration for schedules coming out of storage.
 *
 * Stored schedules are the in-memory shape, JSON-serialized whole — there is no
 * compact encoding to translate through. That makes every change to
 * `SelectedCourse` a change to what sits in users' IndexedDB, and this module is
 * the one place that reconciles the two.
 *
 * It runs at the storage boundary (see IndexedDBStorageManager), which is the
 * only way persisted selections enter memory. Everything downstream — undo/redo
 * snapshots, tutorial snapshots, `deepClone` — copies state that is already in
 * memory, so it is migrated by construction and needs no hook of its own.
 *
 * Migrations must be idempotent and must never throw: a row that cannot be
 * understood is passed through rather than dropped, because dropping is
 * indistinguishable from a user losing their schedule.
 */
import { logger } from '../../utils/logger';
import { COMPONENT_KINDS, type ComponentKind, type Course, type Section } from '../../types/types';
import type { Schedule } from '../../types/schedule';

/**
 * Bump when the stored shape of a `Schedule` changes, and add the matching rung
 * to `migrateSelectedCourse`. Rows are stamped on save and re-migrated on read
 * whenever their stamp is older than this.
 *
 * 1 — a single `selectedSection`, whatever component the course had.
 * 2 — component selections split into three parallel selected* fields.
 * 3 — those three collapsed into one keyed `selected` map.
 *
 * `tests/fixtures/legacy-schedules.json` holds a row per version, named for it
 * (`v1-schedule`, `v2-schedule`, …); add one alongside each new rung.
 */
export const SCHEDULE_SCHEMA_VERSION = 3;

type StoredCourse = Record<string, unknown> & { course?: Course };

/** The v2 field name each component kind used to live under. */
const V2_FIELDS: Record<ComponentKind, string> = {
    lecture: 'selectedLecture',
    discussion: 'selectedDiscussion',
    lab: 'selectedLab',
};

/**
 * Pre-2.0: one `selectedSection` covered whatever component the course had.
 * Which slot it belongs in is only recoverable from the course structure — a
 * course with lectures put its lecture there, a lab-only course its lab.
 */
function upgradeSelectedSection(stored: StoredCourse): StoredCourse {
    if (!stored.selectedSection || stored.selectedLecture || stored.selectedLab) return stored;

    const { selectedSection, ...rest } = stored;
    const hasLectures = Boolean(stored.course?.lectures?.length);
    return {
        ...rest,
        selectedLecture: hasLectures ? selectedSection : null,
        selectedDiscussion: stored.selectedDiscussion ?? null,
        selectedLab: hasLectures ? null : selectedSection,
    };
}

/**
 * v2 → v3: three parallel nullable fields become one keyed map. A kind that was
 * null becomes an absent key, so `Object.keys(selected).length` is meaningful
 * and the serialized form carries no empty slots.
 */
function collapseToSelectedMap(stored: StoredCourse): StoredCourse {
    if (stored.selected) return stored;
    if (!COMPONENT_KINDS.some(kind => V2_FIELDS[kind] in stored)) return stored;

    const rest = { ...stored };
    const selected: Partial<Record<ComponentKind, Section>> = {};
    for (const kind of COMPONENT_KINDS) {
        const section = rest[V2_FIELDS[kind]];
        delete rest[V2_FIELDS[kind]];
        if (section) selected[kind] = section as Section;
    }

    return { ...rest, selected };
}

/** Upgrades one stored course, returning a new object only when it changed. */
function migrateSelectedCourse(stored: StoredCourse): StoredCourse {
    return collapseToSelectedMap(upgradeSelectedSection(stored));
}

/**
 * Migrates one stored schedule to the current shape.
 *
 * `storedVersion` is the row's stamp; rows written before stamping exist, so
 * `undefined` means "as old as it gets" rather than "current".
 */
export function migrateStoredSchedule(raw: unknown, storedVersion?: number): Schedule {
    if (!raw || typeof raw !== 'object') return raw as Schedule;
    if (typeof storedVersion === 'number' && storedVersion >= SCHEDULE_SCHEMA_VERSION) {
        return raw as Schedule;
    }

    const schedule = raw as Record<string, unknown>;
    if (!Array.isArray(schedule.selectedCourses)) return raw as Schedule;

    let changed = 0;
    const selectedCourses = schedule.selectedCourses.map(sc => {
        if (!sc || typeof sc !== 'object') return sc;
        const migrated = migrateSelectedCourse(sc as StoredCourse);
        if (migrated !== sc) changed++;
        return migrated;
    });

    if (changed > 0) {
        logger.log(`Migrated ${changed} stored course(s) in schedule ${String(schedule.id)}`);
    }

    return { ...schedule, selectedCourses } as unknown as Schedule;
}
