/**
 * ScheduleManagementService's name policy: rename rejects a clash, create and
 * duplicate uniquify, and all three trim and compare the same way.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProfileStateManager } from '../../src/core/state/ProfileStateManager';
import { ScheduleManagementService } from '../../src/services/selection/ScheduleManagementService';
import { appState } from '../../src/core/state/appState.svelte';
import type { TransactionalStorageManager } from '../../src/core/storage/TransactionalStorageManager';

const ok = { success: true, transactionId: 't' };

function makeService(): {
  sms: ScheduleManagementService;
  psm: ProfileStateManager;
} {
  const storage = {
    saveSchedule: vi.fn(() => Promise.resolve(ok)),
    deleteSchedule: vi.fn(() => Promise.resolve(ok)),
    saveActiveScheduleId: vi.fn(() => ok),
    savePreferences: vi.fn(() => ok),
    clearAllDataComplete: vi.fn(() => Promise.resolve(ok)),
  } as unknown as TransactionalStorageManager;
  // The constructor is private (getInstance() is the app's way in).
  const Ctor = ProfileStateManager as unknown as new (
    s: TransactionalStorageManager,
  ) => ProfileStateManager;
  const psm = new Ctor(storage);
  return { sms: new ScheduleManagementService(psm), psm };
}

function names(): string[] {
  return appState.schedules.map(s => s.name);
}

beforeEach(() => {
  appState.schedules = [];
  appState.selectedCourses = [];
  appState.activeScheduleId = null;
});

describe('ScheduleManagementService names', () => {
  it('uniquifies a created name that clashes', async () => {
    const { sms } = makeService();
    await sms.initialize(); // creates "My Schedule"
    const result = await sms.createNewSchedule('  My Schedule ');
    expect(result.success).toBe(true);
    expect(result.schedule?.name).toBe('My Schedule (1)');
  });

  it('uniquifies a duplicate the same way', async () => {
    const { sms } = makeService();
    await sms.initialize();
    const [original] = appState.schedules;
    const first = await sms.duplicateSchedule(original.id, 'Copy');
    const second = await sms.duplicateSchedule(original.id, 'Copy ');
    expect(first.schedule?.name).toBe('Copy');
    expect(second.schedule?.name).toBe('Copy (1)');
  });

  it('rejects a rename onto another schedule’s name', async () => {
    const { sms } = makeService();
    await sms.initialize();
    const b = await sms.createNewSchedule('B');
    const result = await sms.renameSchedule(b.schedule!.id, ' My Schedule ');
    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
    expect(names()).toEqual(['My Schedule', 'B']);
  });

  it('treats a rename to the current name as a no-op success', async () => {
    const { sms } = makeService();
    await sms.initialize();
    const [a] = appState.schedules;
    const result = await sms.renameSchedule(a.id, ' My Schedule ');
    expect(result.success).toBe(true);
    expect(names()).toEqual(['My Schedule']);
  });

  it('trims a rename and keeps case-distinct names apart', async () => {
    const { sms } = makeService();
    await sms.initialize();
    const [a] = appState.schedules;
    await sms.createNewSchedule('B');
    const result = await sms.renameSchedule(a.id, '  b  ');
    expect(result.success).toBe(true);
    expect(names()).toEqual(['b', 'B']);
  });

  it('rejects an empty name everywhere', async () => {
    const { sms } = makeService();
    await sms.initialize();
    const [a] = appState.schedules;
    expect((await sms.renameSchedule(a.id, '   ')).success).toBe(false);
    expect((await sms.createNewSchedule('   ')).success).toBe(false);
    expect((await sms.duplicateSchedule(a.id, '   ')).success).toBe(false);
  });
});
