import type { Course, SectionsByKind } from '../../types/types';

/**
 * Shared wizard-preview state for the schedule grid (Svelte 5 runes).
 *
 * The still-vanilla {@link ComponentSelectionWizard} writes these as the user
 * navigates/hovers; the declarative `ScheduleGrids` reads them to overlay a
 * preview onto the grid. Replaces the old private `wizardPreviewCourse` /
 * `wizardPreviewSelections` / `hoverPreviewSelections` fields on
 * `ScheduleController` (which re-rendered the grid imperatively).
 *
 * - `previewCourse` + `selections`: the wizard's CURRENT committed selection —
 *   overlaid onto the selected list so it renders as solid blocks.
 * - `previewCourse` + `hover`: a hovered (not-yet-committed) option — rendered
 *   as a dashed, border-only preview block.
 */
class SchedulePreviewState {
    previewCourse = $state.raw<Course | null>(null);
    selections = $state.raw<SectionsByKind | null>(null);
    hover = $state.raw<SectionsByKind | null>(null);

    clear(): void {
        this.previewCourse = null;
        this.selections = null;
        this.hover = null;
    }
}

export const schedulePreviewState = new SchedulePreviewState();
