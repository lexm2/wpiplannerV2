/**
 * ProfileStateManager's save path, against a fake storage manager: save()
 * rewrites only the schedules whose object changed since their last
 * successful write.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProfileStateManager } from '../../src/core/state/ProfileStateManager';
import { appState } from '../../src/core/state/appState.svelte';
import type { TransactionalStorageManager } from '../../src/core/storage/TransactionalStorageManager';
import type { Schedule } from '../../src/types/schedule';

const ok = { success: true, transactionId: 't' };

function fakeStorage() {
  const writes: string[] = [];
  let failNext = false;
  const storage = {
    saveSchedule: vi.fn((s: Schedule) => {
      writes.push(s.id);
      if (failNext) {
        failNext = false;
        return Promise.resolve({ ...ok, success: false, error: new Error() });
      }
      return Promise.resolve(ok);
    }),
    deleteSchedule: vi.fn(() => Promise.resolve(ok)),
    saveActiveScheduleId: vi.fn(() => ok),
    savePreferences: vi.fn(() => ok),
    clearAllDataComplete: vi.fn(() => Promise.resolve(ok)),
  };
  return {
    storage: storage as unknown as TransactionalStorageManager,
    writes,
    failNextWrite: () => (failNext = true),
  };
}

function makePsm(storage: TransactionalStorageManager): ProfileStateManager {
  // The constructor is private (getInstance() is the app's way in); the test
  // needs its storage-manager seam.
  const Ctor = ProfileStateManager as unknown as new (
    s: TransactionalStorageManager,
  ) => ProfileStateManager;
  return new Ctor(storage);
}

async function settled(psm: ProfileStateManager): Promise<void> {
  await vi.waitFor(() => expect(psm.hasPendingSaves()).toBe(false));
}

beforeEach(() => {
  appState.schedules = [];
  appState.selectedCourses = [];
  appState.activeScheduleId = null;
});

describe('ProfileStateManager save', () => {
  it('rewrites only the schedule that changed', async () => {
    const { storage, writes } = fakeStorage();
    const psm = makePsm(storage);
    const a = psm.createSchedule('A');
    await settled(psm);
    psm.createSchedule('B');
    await settled(psm);
    writes.length = 0;

    psm.renameSchedule(a.id, 'A2');
    await settled(psm);
    expect(writes).toEqual([a.id]);
  });

  it('retries a schedule whose write failed', async () => {
    const { storage, writes, failNextWrite } = fakeStorage();
    const psm = makePsm(storage);
    failNextWrite();
    const a = psm.createSchedule('A');
    await settled(psm);
    writes.length = 0;

    psm.save();
    await settled(psm);
    expect(writes).toEqual([a.id]);
  });

  it('writes a deleted-then-restored schedule again', async () => {
    const { storage, writes } = fakeStorage();
    const psm = makePsm(storage);
    psm.createSchedule('A');
    const b = psm.createSchedule('B');
    await settled(psm);

    const restored = appState.schedules.find(s => s.id === b.id)!;
    await psm.deleteSchedule(b.id);
    await settled(psm);
    writes.length = 0;

    // Same object back in state, as nothing in the app does but the check
    // must not rely on that.
    appState.schedules = [...appState.schedules, restored];
    psm.save();
    await settled(psm);
    expect(writes).toEqual([b.id]);
  });

  it('writes everything after forgetSavedSchedules()', async () => {
    const { storage, writes } = fakeStorage();
    const psm = makePsm(storage);
    const a = psm.createSchedule('A');
    const b = psm.createSchedule('B');
    await settled(psm);
    writes.length = 0;

    psm.forgetSavedSchedules();
    psm.save();
    await settled(psm);
    expect(writes.sort()).toEqual([a.id, b.id].sort());
  });
});
