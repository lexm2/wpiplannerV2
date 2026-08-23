<script lang="ts">
  import type { StudentRecord } from '../../types/degree';
  import type { DegreeImportService } from '../../services/degree/degreeImportService';
  import { degreePlanService } from '../../services/degree/degreePlanService';
  import { degreeState } from './degreeState.svelte';
  import { appState } from '../../core/state/appState.svelte';

  let {
    record,
    degreeImportService,
  }: {
    record: StudentRecord;
    degreeImportService: DegreeImportService;
  } = $props();

  let fileInput = $state<HTMLInputElement | null>(null);

  const plannedCount = $derived(
    record.courses.filter(c => c.isInProgress).length,
  );

  // "Check current schedule" preview - overlay of what the active schedule fills.
  const scheduleCourseCount = $derived(appState.selectedCourses.length);
  const overlayOn = $derived(degreeState.scheduleMatch !== null);
  const overlayMatched = $derived.by(() => {
    const m = degreeState.scheduleMatch;
    if (!m) return 0;
    const ids = new Set<string>();
    for (const entries of m.values())
      for (const e of entries) ids.add(e.courseId);
    return ids.size;
  });

  let building = $state(false);
  let buildResult = $state<string | null>(null);
  let buildUnmatched = $state<string[]>([]);

  async function buildSchedule(): Promise<void> {
    if (building || plannedCount === 0) return;
    building = true;
    buildResult = null;
    buildUnmatched = [];
    try {
      const stats = await degreePlanService.buildFromPlan(record);
      buildResult =
        `Created “Enrolled” - ${stats.matched} added` +
        ` (${stats.autoSectioned} with sections, ${stats.pinnedOnly} pinned to term).`;
      buildUnmatched = stats.unmatched;
    } catch (err) {
      buildResult =
        err instanceof Error ? err.message : 'Failed to build schedule.';
    } finally {
      building = false;
    }
  }

  const required = $derived(record.credits.required);
  // Overall progress = completed (earned, incl. transfer) toward the degree total.
  const overallPct = $derived(
    required && required > 0
      ? Math.min(100, Math.round((record.credits.earned / required) * 100))
      : null,
  );

  const title = $derived(
    [record.major, record.degree].filter(Boolean).join(' · ') ||
      'Academic Progress',
  );

  async function onInputChange(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      try {
        await degreeImportService.importFromFile(file);
      } catch {
        /* surfaced in state */
      }
    }
  }
</script>

<section class="degree-summary">
  <div class="degree-summary-head">
    <div>
      <h2 class="degree-summary-title">{title}</h2>
      {#if record.startYear}
        <p class="degree-summary-sub">Entered {record.startYear}</p>
      {/if}
    </div>
    <div class="degree-summary-actions">
      <button type="button" class="btn" onclick={() => fileInput?.click()}
        >Re-import</button
      >
      <button
        type="button"
        class="btn btn-ghost"
        onclick={() => degreeImportService.clear()}>Clear</button
      >
      <input
        bind:this={fileInput}
        type="file"
        accept=".xlsx"
        id="degree-reimport-file"
        class="degree-file-input"
        onchange={onInputChange}
      />
    </div>
  </div>

  {#if overallPct !== null}
    <div class="degree-progress">
      <div class="degree-progress-bar">
        <div class="degree-progress-fill" style:width="{overallPct}%"></div>
      </div>
      <span class="degree-progress-label"
        >{overallPct}% of {required} credits</span
      >
    </div>
  {/if}

  <div class="degree-credit-stats">
    <div class="degree-stat">
      <span class="degree-stat-value">{record.credits.earned}</span><span
        class="degree-stat-label">Earned</span
      >
    </div>
    <div class="degree-stat">
      <span class="degree-stat-value">{record.credits.inProgress}</span><span
        class="degree-stat-label">In progress</span
      >
    </div>
    <div class="degree-stat">
      <span class="degree-stat-value">{record.credits.transfer}</span><span
        class="degree-stat-label">Transfer</span
      >
    </div>
    <div class="degree-stat">
      <span class="degree-stat-value">{required ?? '-'}</span><span
        class="degree-stat-label">Required</span
      >
    </div>
  </div>

  {#if plannedCount > 0 || scheduleCourseCount > 0}
    <div class="degree-build">
      {#if plannedCount > 0}
        <button
          type="button"
          class="btn btn-primary degree-build-btn"
          disabled={building}
          onclick={buildSchedule}
        >
          {building
            ? 'Building…'
            : `Build schedule from plan (${plannedCount} planned)`}
        </button>
      {/if}
      <button
        type="button"
        class="btn degree-check-btn"
        class:active={overlayOn}
        disabled={scheduleCourseCount === 0}
        onclick={() => degreePlanService.checkActiveSchedule()}
      >
        {overlayOn
          ? `Hide schedule overlay (${overlayMatched} matched)`
          : 'Check current schedule'}
      </button>
      {#if buildResult}
        <p class="degree-build-result">{buildResult}</p>
      {/if}
      {#if buildUnmatched.length}
        <p class="degree-build-unmatched">
          Not found in catalog: {buildUnmatched.join(', ')}
        </p>
      {/if}
      {#if overlayOn}
        <p class="degree-build-unmatched">
          Drag a schedule tile to another requirement to re-bucket it.
        </p>
      {/if}
    </div>
  {/if}
</section>
