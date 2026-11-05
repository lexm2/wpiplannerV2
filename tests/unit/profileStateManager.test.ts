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
  const savedNames: string[] = [];
  let failNext = false;
  const storage = {
    saveSchedule: vi.fn((s: Schedule) => {
      writes.push(s.id);
      savedNames.push(s.name);
      if (failNext) {
        failNext = false;
        return Promise.resolve({ ...ok, success: false, error: new Error() });
      }
      // Resolves a tick later, as a real write does, so saves overlap it.
      return new Promise(resolve => setTimeout(() => resolve(ok), 0));
    }),
    deleteSchedule: vi.fn(() => Promise.resolve(ok)),
    saveActiveScheduleId: vi.fn(() => ok),
    savePreferences: vi.fn(() => ok),
    clearAllDataComplete: vi.fn(() => Promise.resolve(ok)),
    subscribe: vi.fn(() => () => undefined),
  };
  return {
    storage: storage as unknown as TransactionalStorageManager,
    writes,
    savedNames,
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

  it('writes a burst of edits to one schedule at most twice, ending on the latest', async () => {
    const { storage, writes, savedNames } = fakeStorage();
    const psm = makePsm(storage);
    const a = psm.createSchedule('A');
    await settled(psm);
    writes.length = 0;
    savedNames.length = 0;

    for (let i = 1; i <= 25; i++) psm.renameSchedule(a.id, `A${i}`);
    expect(psm.hasPendingSaves()).toBe(true);
    await settled(psm);

    expect(writes.length).toBeLessThanOrEqual(2);
    expect(savedNames.at(-1)).toBe('A25');
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

  it('writes the active schedule after markActiveScheduleChanged()', async () => {
    const { storage, writes } = fakeStorage();
    const psm = makePsm(storage);
    const a = psm.createSchedule('A');
    psm.createSchedule('B');
    psm.setActiveSchedule(a.id);
    await settled(psm);
    writes.length = 0;

    psm.markActiveScheduleChanged();
    psm.save();
    await settled(psm);
    expect(writes).toEqual([a.id]);
  });
});
