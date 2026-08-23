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
  private history: StateSnapshot[] = [];
  private currentIndex = -1;

  captureSnapshot(
    activeScheduleId: string | null,
    schedules: Map<string, Schedule>,
    preferences: SchedulePreferences,
  ): void {
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    const snapshot: StateSnapshot = {
      timestamp: Date.now(),
      activeScheduleId,
      schedules: this.deepCloneSchedulesMap(schedules),
      preferences: this.deepClone(preferences),
    };

    this.history.push(snapshot);

    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }

    this.notifyListeners();
  }

  undo(): StateSnapshot | null {
    if (!this.canUndo()) {
      return null;
    }

    this.currentIndex--;
    this.notifyListeners();
    return this.history[this.currentIndex];
  }

  redo(): StateSnapshot | null {
    if (!this.canRedo()) {
      return null;
    }

    this.currentIndex++;
    this.notifyListeners();
    return this.history[this.currentIndex];
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

  /** Publish current undo/redo availability for reactive consumers. */
  private notifyListeners(): void {
    appState.canUndo = this.canUndo();
    appState.canRedo = this.canRedo();
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj, setReplacer), setReviver);
  }

  private deepCloneSchedulesMap(
    schedules: Map<string, Schedule>,
  ): Map<string, Schedule> {
    const schedulesArray = Array.from(schedules.entries());
    const clonedArray = this.deepClone(schedulesArray);
    return new Map(clonedArray);
  }
}
