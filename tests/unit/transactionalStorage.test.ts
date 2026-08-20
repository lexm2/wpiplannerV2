/**
 * Tests for the localStorage half of TransactionalStorageManager, including the
 * rollback path — previously zero coverage, and the audit called it the highest
 * silent-corruption risk in the app.
 *
 * Scope note: schedules live in IndexedDB and are exercised through async
 * methods that need a real IDB; these cover the synchronous, transactional
 * localStorage surface (preferences, user state, active schedule id, degree
 * record, clear-all) which is where the rollback logic actually runs.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TransactionalStorageManager } from '../../src/core/storage/TransactionalStorageManager';
import { STORAGE_KEYS } from '../../src/utils/storageKeys';

function mgr(): TransactionalStorageManager {
    return new TransactionalStorageManager();
}

beforeEach(() => localStorage.clear());

describe('preferences round-trip', () => {
    it('saves and loads preferences', () => {
        const m = mgr();
        const res = m.savePreferences({ theme: 'wpi-light', bookmarkedCourseIds: ['CS1101'] });
        expect(res.success).toBe(true);
        const loaded = m.loadPreferences();
        expect(loaded.valid).toBe(true);
        expect(loaded.data.theme).toBe('wpi-light');
        expect(loaded.data.bookmarkedCourseIds).toEqual(['CS1101']);
    });

    it('writes to the shared registry key, not an ad-hoc literal', () => {
        mgr().savePreferences({ theme: 'wpi-dark', bookmarkedCourseIds: [] });
        expect(localStorage.getItem(STORAGE_KEYS.PREFERENCES)).toContain('wpi-dark');
    });

    it('returns defaults when nothing is stored', () => {
        const loaded = mgr().loadPreferences();
        expect(loaded.valid).toBe(true);
        expect(loaded.data).toBeTruthy();
    });

    it('falls back to defaults on corrupt JSON rather than throwing', () => {
        localStorage.setItem(STORAGE_KEYS.PREFERENCES, '{not valid json');
        const loaded = mgr().loadPreferences();
        expect(loaded.data).toBeTruthy();
        expect(loaded.valid).toBe(false);
    });
});

describe('active schedule id', () => {
    it('round-trips an id', () => {
        const m = mgr();
        expect(m.saveActiveScheduleId('sched-1').success).toBe(true);
        expect(m.loadActiveScheduleId().data).toBe('sched-1');
    });

    it('clears the key when given null', () => {
        const m = mgr();
        m.saveActiveScheduleId('sched-1');
        m.saveActiveScheduleId(null);
        expect(m.loadActiveScheduleId().data).toBeNull();
    });
});

describe('degree record', () => {
    it('round-trips a record and clears on null', () => {
        const m = mgr();
        const record = { major: 'Computer Science', classYear: 2030, requirements: [], appliedCourses: [] };
        expect(m.saveDegreeRecord(record as never).success).toBe(true);
        expect(m.loadDegreeRecord().data).toMatchObject({ major: 'Computer Science' });

        m.saveDegreeRecord(null);
        expect(m.loadDegreeRecord().data).toBeNull();
    });
});

describe('rollback', () => {
    it('restores every touched key when an operation throws mid-transaction', () => {
        const m = mgr();
        m.savePreferences({ theme: 'wpi-light', bookmarkedCourseIds: [] });
        m.saveActiveScheduleId('before');

        const before = {
            prefs: localStorage.getItem(STORAGE_KEYS.PREFERENCES),
            active: localStorage.getItem(STORAGE_KEYS.ACTIVE_SCHEDULE_ID),
        };

        // Reach the private transaction runner the same way the public methods do,
        // but with an operation that mutates several keys and then fails.
        const result = (m as unknown as {
            executeSyncTransaction: (op: () => void) => { success: boolean; rolledBack?: boolean };
        }).executeSyncTransaction(() => {
            localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify({ theme: 'CORRUPT' }));
            localStorage.setItem(STORAGE_KEYS.ACTIVE_SCHEDULE_ID, 'after');
            throw new Error('boom');
        });

        expect(result.success).toBe(false);
        expect(localStorage.getItem(STORAGE_KEYS.PREFERENCES)).toBe(before.prefs);
        expect(localStorage.getItem(STORAGE_KEYS.ACTIVE_SCHEDULE_ID)).toBe(before.active);
    });

    it('leaves a successful transaction committed', () => {
        const m = mgr();
        const result = (m as unknown as {
            executeSyncTransaction: (op: () => void) => { success: boolean };
        }).executeSyncTransaction(() => {
            localStorage.setItem(STORAGE_KEYS.ACTIVE_SCHEDULE_ID, 'committed');
        });
        expect(result.success).toBe(true);
        expect(localStorage.getItem(STORAGE_KEYS.ACTIVE_SCHEDULE_ID)).toBe('committed');
    });
});

describe('clearAllData', () => {
    it('removes every registry key, including the legacy schedules key', () => {
        const m = mgr();
        m.savePreferences({ theme: 'wpi-dark', bookmarkedCourseIds: [] });
        m.saveActiveScheduleId('sched-1');
        localStorage.setItem(STORAGE_KEYS.LEGACY_SCHEDULES, '[]');
        localStorage.setItem(STORAGE_KEYS.USER_STATE, '{}');

        expect(m.clearAllData().success).toBe(true);

        for (const key of Object.values(STORAGE_KEYS)) {
            expect(localStorage.getItem(key)).toBeNull();
        }
    });

    it('leaves unrelated keys alone', () => {
        localStorage.setItem('someone-elses-key', 'keep me');
        mgr().clearAllData();
        expect(localStorage.getItem('someone-elses-key')).toBe('keep me');
    });
});
