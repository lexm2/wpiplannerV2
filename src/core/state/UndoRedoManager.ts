import { setReplacer, setReviver } from '../../utils/jsonSerializer';
import type { Schedule, SchedulePreferences } from '../../types/schedule';
import { appState } from './appState.svelte';

export interface StateSnapshot {
  timestamp: number;
  activeScheduleId: string | null;
  schedules: Map<string, Schedule>;
  preferences: SchedulePreferences;
}

export class UndoRedoManager {
  private maxHistorySize = 100;
  // Each entry is kept serialized and only parsed when undo/redo returns it:
  // most entries are never revisited, and a string is far smaller than the
  // object graph it encodes.
  private history: Array<{ timestamp: number; serialized: string }> = [];
  private currentIndex = -1;

  captureSnapshot(
    activeScheduleId: string | null,
    schedules: Map<string, Schedule>,
    preferences: SchedulePreferences,
  ): void {
    const serialized = JSON.stringify(
      [activeScheduleId, Array.from(schedules.entries()), preferences],
      setReplacer,
    );
    // One action can reach save() more than once (a no-op edit, or several
    // steps that each save). An unchanged state is not a new step, and must
    // not cost an Undo press or drop the redo branch.
    if (serialized === this.history[this.currentIndex]?.serialized) return;

    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    this.history.push({ timestamp: Date.now(), serialized });

    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }

    this.notifyListeners();
  }

  /**
   * Makes the as-loaded state history[0], so the first user change is
   * undoable and nothing before it is. Anything boot captured earlier (the
   * default schedule's creation, the year backfill) is dropped: it is
   * housekeeping, not something the user did.
   */
  captureBaseline(
    activeScheduleId: string | null,
    schedules: Map<string, Schedule>,
    preferences: SchedulePreferences,
  ): void {
    this.history = [];
    this.currentIndex = -1;
    this.captureSnapshot(activeScheduleId, schedules, preferences);
  }

  undo(): StateSnapshot | null {
    if (!this.canUndo()) {
      return null;
    }

    this.currentIndex--;
    this.notifyListeners();
    return this.snapshotAt(this.currentIndex);
  }

  redo(): StateSnapshot | null {
    if (!this.canRedo()) {
      return null;
    }

    this.currentIndex++;
    this.notifyListeners();
    return this.snapshotAt(this.currentIndex);
  }

  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  clear(): void {
    this.history = [];
    this.currentIndex = -1;
    this.notifyListeners();
  }

  /** Parse a history entry back into a fresh snapshot. */
  private snapshotAt(index: number): StateSnapshot {
    const { timestamp, serialized } = this.history[index];
    const [activeScheduleId, entries, preferences] = JSON.parse(
      serialized,
      setReviver,
    ) as [string | null, Array<[string, Schedule]>, SchedulePreferences];
    return {
      timestamp,
      activeScheduleId,
      schedules: new Map(entries),
      preferences,
    };
  }

  /** Publish current undo/redo availability for reactive consumers. */
  private notifyListeners(): void {
    appState.canUndo = this.canUndo();
    appState.canRedo = this.canRedo();
  }
}
