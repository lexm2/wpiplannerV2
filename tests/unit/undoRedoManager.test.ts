import { describe, it, expect } from 'vitest';
import { UndoRedoManager } from '../../src/core/state/UndoRedoManager';
import type { Schedule, SchedulePreferences } from '../../src/types/schedule';

const prefs = { theme: 'wpi-dark' } as unknown as SchedulePreferences;

function schedules(...names: string[]): Map<string, Schedule> {
  return new Map(
    names.map(name => [
      name,
      {
        id: name,
        name,
        selectedCourses: [],
        generatedSchedules: [],
      },
    ]),
  );
}

describe('UndoRedoManager', () => {
  it('does not record a snapshot identical to the current one', () => {
    // One user action can reach save() twice (e.g. ProfileStateManager saves
    // and ScheduleManagementService autosaves). The second save must not cost
    // the user an extra Undo press.
    const m = new UndoRedoManager();
    m.captureSnapshot('a', schedules('a'), prefs);
    m.captureSnapshot('a', schedules('a', 'b'), prefs);
    m.captureSnapshot('a', schedules('a', 'b'), prefs);

    const back = m.undo();
    expect([...back!.schedules.keys()]).toEqual(['a']);
    expect(m.canUndo()).toBe(false);
  });

  it('keeps redo history when a duplicate snapshot arrives', () => {
    const m = new UndoRedoManager();
    m.captureSnapshot('a', schedules('a'), prefs);
    m.captureSnapshot('a', schedules('a', 'b'), prefs);
    m.undo();
    // undo() restores and saves the restored state again.
    m.captureSnapshot('a', schedules('a'), prefs);

    expect(m.canRedo()).toBe(true);
  });

  it('still records a real change', () => {
    const m = new UndoRedoManager();
    m.captureSnapshot('a', schedules('a'), prefs);
    m.captureSnapshot('b', schedules('a'), prefs);
    expect(m.canUndo()).toBe(true);
  });

  it('makes the baseline the start of history, dropping boot housekeeping', () => {
    const m = new UndoRedoManager();
    m.captureSnapshot('a', schedules('a'), prefs);
    m.captureSnapshot('a', schedules('a', 'b'), prefs);
    m.captureBaseline('a', schedules('a', 'b'), prefs);
    expect(m.canUndo()).toBe(false);

    m.captureSnapshot('a', schedules('a', 'b', 'c'), prefs);
    expect([...m.undo()!.schedules.keys()]).toEqual(['a', 'b']);
  });

  it('returns a fresh copy of the entry, with Sets revived', () => {
    const m = new UndoRedoManager();
    const withLock = schedules('a');
    withLock.get('a')!.selectedCourses = [
      {
        course: { id: 'CS1101' },
        selected: {},
        isRequired: false,
        lockedSections: new Set(['123']),
      } as unknown as Schedule['selectedCourses'][number],
    ];
    m.captureSnapshot('a', withLock, prefs);
    m.captureSnapshot('a', schedules('a'), prefs);

    const back = m.undo()!;
    const locked = back.schedules.get('a')!.selectedCourses[0].lockedSections;
    expect(locked).toBeInstanceOf(Set);
    expect([...locked]).toEqual(['123']);
    // Mutating what undo() handed out cannot corrupt the history.
    back.schedules.get('a')!.name = 'changed';
    m.redo();
    expect(m.undo()!.schedules.get('a')!.name).toBe('a');
  });

  it('hands back the live object for a schedule the step left unchanged', () => {
    const m = new UndoRedoManager();
    const before = schedules('a', 'b');
    m.captureSnapshot('a', before, prefs);
    const after = new Map(before);
    after.set('b', { ...before.get('b')!, name: 'renamed' });
    m.captureSnapshot('a', after, prefs);

    const back = m.undo([...after.values()])!;
    expect(back.schedules.get('a')).toBe(after.get('a'));
    expect(back.schedules.get('b')).not.toBe(after.get('b'));
    expect(back.schedules.get('b')!.name).toBe('b');
  });

  it('re-serializes a schedule after forget()', () => {
    const m = new UndoRedoManager();
    const map = schedules('a');
    m.captureSnapshot('a', map, prefs);
    const a = map.get('a')!;
    a.name = 'edited in place';
    // Same object: its cached JSON still says the old name.
    m.captureSnapshot('a', map, prefs);
    expect(m.canUndo()).toBe(false);

    m.forget(a);
    m.captureSnapshot('a', map, prefs);
    expect(m.canUndo()).toBe(true);
  });
});
