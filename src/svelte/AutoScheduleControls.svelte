<script lang="ts">
  import { appState } from '../core/state/appState.svelte';
  import { getInlineSVG } from '../utils/iconPaths';
  import { showAppError } from '../services/ui/uiState.svelte';
  import { logger } from '../utils/logger';
  import type { AutoScheduleOrchestrator } from '../services/scheduling/AutoScheduleOrchestrator';

  let {
    autoScheduleOrchestrator,
    onOpenAutoSchedule,
  }: {
    autoScheduleOrchestrator: AutoScheduleOrchestrator;
    onOpenAutoSchedule: () => void;
  } = $props();

  // The orchestrator publishes its result count + applied index to these runes
  // on every transition (generate / navigate / reset / selection-invalidation),
  // so the footer's nav + progress bar stay in sync on their own.
  const generatedCount = $derived(appState.autoScheduleCount);
  const currentIndex = $derived(appState.autoScheduleIndex);
  const hasSchedules = $derived(generatedCount > 0);
  // No second run while one is in flight (the grid shows its overlay).
  const generating = $derived(appState.scheduleGenerating);
  const progressPct = $derived(
    hasSchedules ? ((currentIndex + 1) / generatedCount) * 100 : 0,
  );

  // Nav re-applies the schedule at the new index via batchSetSelectedComponents,
  // which updates appState.selectedCourses - the declarative grid reacts on its
  // own, and the orchestrator publishes appState.autoScheduleIndex so this
  // footer's progress updates too. No after-navigate callback needed.
  // One step at a time: a second click while the first is still applying
  // would race it. Guarded here rather than by disabling the button, which
  // would drop keyboard focus on every step.
  let navigating = $state(false);
  async function navigate(direction: -1 | 1): Promise<void> {
    if (navigating || generating) return;
    navigating = true;
    try {
      await autoScheduleOrchestrator.navigateSchedule(direction);
    } catch (error) {
      logger.error('Failed to navigate schedules:', error);
      showAppError('Failed to switch schedules. Please try again.');
    } finally {
      navigating = false;
    }
  }
  const prev = (): Promise<void> => navigate(-1);
  const next = (): Promise<void> => navigate(1);
</script>

<div class="schedule-footer-row">
  {#if !hasSchedules}
    <button
      id="auto-schedule-btn"
      class="btn btn-primary auto-schedule-btn"
      title="Automatically generate a schedule"
      aria-label="Auto-generate schedule"
      disabled={generating}
      onclick={onOpenAutoSchedule}
      >{@html getInlineSVG('WAND', 'auto-schedule-icon')}<span
        >Auto-Schedule</span
      ></button
    >
  {:else}
    <div class="schedule-nav-buttons">
      <button
        class="btn btn-secondary schedule-nav-btn"
        title="Previous schedule"
        aria-label="Previous schedule"
        disabled={generating}
        onclick={prev}
        >{@html getInlineSVG('ARROW_BAR_LEFT', 'schedule-nav-icon')}</button
      >
      <button
        class="btn btn-secondary schedule-nav-btn"
        title="Restart auto-schedule"
        aria-label="Restart auto-schedule"
        disabled={generating}
        onclick={onOpenAutoSchedule}
        >{@html getInlineSVG('REFRESH', 'schedule-nav-icon')}</button
      >
      <button
        class="btn btn-secondary schedule-nav-btn"
        title="Next schedule"
        aria-label="Next schedule"
        disabled={generating}
        onclick={next}
        >{@html getInlineSVG('ARROW_BAR_RIGHT', 'schedule-nav-icon')}</button
      >
    </div>
  {/if}
</div>
{#if hasSchedules}
  <div class="schedule-progress-track">
    <div class="schedule-progress-bar" style:width={`${progressPct}%`}></div>
  </div>
{/if}
