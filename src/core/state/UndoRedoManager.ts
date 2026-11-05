import { setReplacer, setReviver } from '../../utils/jsonSerializer';
import type { Schedule, SchedulePreferences } from '../../types/schedule';
import { appState } from './appState.svelte';

export interface StateSnapshot {
  timestamp: number;
  activeScheduleId: string | null;
  schedules: Map<string, Schedule>;
  preferences: SchedulePreferences;
  /** Whatever the registered slice captured alongside the schedules. */
  extra?: unknown;
}

interface HistoryEntry {
  timestamp: number;
  activeScheduleId: string | null;
  /** One serialized schedule per id, shared with every entry that holds it unchanged. */
  schedules: Array<[string, string]>;
  /** Preferences and the undo slice's capture, serialized together. */
  rest: string;
}

export class UndoRedoManager {
  private maxHistorySize = 100;
  // Entries are kept serialized and only parsed when undo/redo returns them.
  // Schedules are replaced rather than mutated, so a schedule's JSON is
  // computed once per object: an edit re-serializes the one schedule it
  // changed, and every other schedule's string is shared by all entries that
  // hold it, which also keeps 100 steps of a large profile small.
  private history: HistoryEntry[] = [];
  private currentIndex = -1;
  private serialized = new WeakMap<Schedule, string>();

  private serializeSchedule(schedule: Schedule): string {
    let json = this.serialized.get(schedule);
    if (json === undefined) {
      json = JSON.stringify(schedule, setReplacer);
      this.serialized.set(schedule, json);
    }
    return json;
  }

  /** For a schedule whose courses were edited in place, so its cached JSON is stale. */
  forget(schedule: Schedule): void {
    this.serialized.delete(schedule);
  }

  private static sameEntry(a: HistoryEntry, b: HistoryEntry): boolean {
    return (
      a.activeScheduleId === b.activeScheduleId &&
      a.rest === b.rest &&
      a.schedules.length === b.schedules.length &&
      a.schedules.every(
        ([id, json], i) =>
          id === b.schedules[i][0] && json === b.schedules[i][1],
      )
    );
  }

  captureSnapshot(
    activeScheduleId: string | null,
    schedules: Map<string, Schedule>,
    preferences: SchedulePreferences,
    extra?: unknown,
  ): void {
    const entry: HistoryEntry = {
      timestamp: Date.now(),
      activeScheduleId,
      schedules: Array.from(schedules, ([id, schedule]) => [
        id,
        this.serializeSchedule(schedule),
      ]),
      rest: JSON.stringify([preferences, extra], setReplacer),
    };
    // One action can reach save() more than once (a no-op edit, or several
    // steps that each save). An unchanged state is not a new step, and must
    // not cost an Undo press or drop the redo branch.
    const current = this.history[this.currentIndex];
    if (current && UndoRedoManager.sameEntry(current, entry)) return;

    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    this.history.push(entry);

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
    extra?: unknown,
  ): void {
    this.history = [];
    this.currentIndex = -1;
    this.captureSnapshot(activeScheduleId, schedules, preferences, extra);
  }

  /**
   * `present` is the live schedules: a step's schedule that is unchanged from
   * its live counterpart comes back as that same object, unparsed.
   */
  undo(present: readonly Schedule[] = []): StateSnapshot | null {
    if (!this.canUndo()) {
      return null;
    }

    this.currentIndex--;
    this.notifyListeners();
    return this.snapshotAt(this.currentIndex, present);
  }

  redo(present: readonly Schedule[] = []): StateSnapshot | null {
    if (!this.canRedo()) {
      return null;
    }

    this.currentIndex++;
    this.notifyListeners();
    return this.snapshotAt(this.currentIndex, present);
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

  private snapshotAt(
    index: number,
    present: readonly Schedule[],
  ): StateSnapshot {
    const entry = this.history[index];
    const live = new Map(present.map(schedule => [schedule.id, schedule]));
    const [preferences, extra] = JSON.parse(entry.rest, setReviver) as [
      SchedulePreferences,
      unknown,
    ];
    return {
      timestamp: entry.timestamp,
      activeScheduleId: entry.activeScheduleId,
      schedules: new Map(
        entry.schedules.map(([id, json]) => {
          const current = live.get(id);
          const schedule =
            current && this.serializeSchedule(current) === json
              ? current
              : (JSON.parse(json, setReviver) as Schedule);
          return [id, schedule];
        }),
      ),
      preferences,
      extra,
    };
  }

  /** Publish current undo/redo availability for reactive consumers. */
  private notifyListeners(): void {
    appState.canUndo = this.canUndo();
    appState.canRedo = this.canRedo();
  }
}
