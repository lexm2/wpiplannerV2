import type { StudentRecord } from '../../types/degree';
import {
  computePlacements,
  type ScheduleMatch,
  type DegreeTile,
} from '../../services/degree/requirementMatching';

/**
 * Reactive state for the Degree page. `record` is $state.raw because it's
 * replaced wholesale (and must stay structured-cloneable for persistence),
 * matching the appState.schedules convention.
 *
 * The schedule overlay (scheduleMatch + manualMoves) is an ephemeral,
 * non-destructive preview of "what the current schedule fills" - it is never
 * written into `record` and is lost on reload by design.
 */
class DegreeState {
  record = $state.raw<StudentRecord | null>(null);
  status = $state<'empty' | 'parsing' | 'ready' | 'error'>('empty');
  errorMessage = $state<string | null>(null);

  /** Active-schedule overlay match; null = "Check current schedule" off. */
  scheduleMatch = $state.raw<ScheduleMatch | null>(null);
  /** Manual drag re-bucketing: tile key → target requirement rawName. */
  manualMoves = $state.raw<Record<string, string>>({});

  /** Draggable tiles per requirement (planned + schedule), after manual moves. */
  placements = $derived.by<Map<string, DegreeTile[]>>(() =>
    computePlacements(this.record, this.scheduleMatch, this.manualMoves),
  );

  /** Re-bucket a draggable tile onto a different requirement (drag-drop). */
  reassign(tileKey: string, rawName: string): void {
    this.manualMoves = { ...this.manualMoves, [tileKey]: rawName };
  }

  /** Turn the schedule overlay off (planned tiles + their moves stay). */
  clearOverlay(): void {
    this.scheduleMatch = null;
  }
}

export const degreeState = new DegreeState();
