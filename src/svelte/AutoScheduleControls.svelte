<script lang="ts">
  import { appState } from '../core/state/appState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import type { AutoScheduleOrchestrator } from '../services/scheduling/AutoScheduleOrchestrator';

  let {
    autoScheduleOrchestrator,
    onOpenAutoSchedule,
    onAfterNavigate,
  }: {
    autoScheduleOrchestrator: AutoScheduleOrchestrator;
    onOpenAutoSchedule: () => void;
    onAfterNavigate: () => void;
  } = $props();

  // The orchestrator's generated-schedule state lives in plain fields; it bumps
  // appState.autoScheduleGeneration on every transition (generate / navigate /
  // reset / selection-invalidation). Reading that rune inside these $derived
  // makes the footer recompute on its own — replacing ScheduleController's
  // imperative updateAutoScheduleButtonUI() DOM updates and the orchestrator's
  // onStateChange callback.
  const generatedCount = $derived(
    (appState.autoScheduleGeneration, autoScheduleOrchestrator.getGeneratedSchedules().length)
  );
  const currentIndex = $derived(
    (appState.autoScheduleGeneration, autoScheduleOrchestrator.getCurrentScheduleIndex())
  );
  const hasSchedules = $derived(generatedCount > 0);
  const progressPct = $derived(hasSchedules ? ((currentIndex + 1) / generatedCount) * 100 : 0);

  // Nav re-applies the schedule at the new index (orchestrator bumps the rune so
  // this footer's progress updates reactively); the grid is still vanilla until
  // Phase 12C/D, so onAfterNavigate() drives ScheduleController.renderScheduleGrids().
  async function prev(): Promise<void> {
    await autoScheduleOrchestrator.navigateSchedule(-1);
    onAfterNavigate();
  }
  async function next(): Promise<void> {
    await autoScheduleOrchestrator.navigateSchedule(1);
    onAfterNavigate();
  }
</script>

<div class="schedule-footer-row">
  <button
    id="auto-schedule-btn"
    class="btn btn-primary auto-schedule-btn"
    style:display={hasSchedules ? 'none' : ''}
    title="Automatically generate a schedule"
    aria-label="Auto-generate schedule"
    onclick={onOpenAutoSchedule}
  >{@html getInlineSVG('WAND', 'auto-schedule-icon')}<span>Auto-Schedule</span></button>
  <div class="schedule-nav-buttons" style:display={hasSchedules ? 'flex' : 'none'}>
    <button
      class="btn btn-secondary schedule-nav-btn"
      title="Previous schedule"
      aria-label="Previous schedule"
      onclick={prev}
    >{@html getInlineSVG('ARROW_BAR_LEFT', 'schedule-nav-icon')}</button>
    <button
      class="btn btn-secondary schedule-nav-btn"
      title="Restart auto-schedule"
      aria-label="Restart auto-schedule"
      onclick={onOpenAutoSchedule}
    >{@html getInlineSVG('REFRESH', 'schedule-nav-icon')}</button>
    <button
      class="btn btn-secondary schedule-nav-btn"
      title="Next schedule"
      aria-label="Next schedule"
      onclick={next}
    >{@html getInlineSVG('ARROW_BAR_RIGHT', 'schedule-nav-icon')}</button>
  </div>
</div>
<div class="schedule-progress-track" style:display={hasSchedules ? '' : 'none'}>
  <div class="schedule-progress-bar" style:width={`${progressPct}%`}></div>
</div>
