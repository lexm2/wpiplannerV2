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
});
