<script lang="ts">
  import type { StudentRecord } from '../../types/degree';
  import type { DegreeImportService } from '../../services/degree/degreeImportService';
  import { openModal } from '../../services/ui/uiState.svelte';
  import { showConfirm } from '../modals/modalState.svelte';
  import { degreeState } from './degreeState.svelte';
  import { phoneLayout } from '../phoneLayout.svelte';
  import { getInlineSVG } from '../../utils/iconPaths';
  import { clickOutside } from '../clickOutside';
  import { scaleFade, slideFade } from '../transitions';
  import { appState } from '../../core/state/appState.svelte';
  import {
    projectPlan,
    UMBRELLA_CATEGORIES,
  } from '../../services/degree/degreeBuckets';

  let {
    record,
    degreeImportService,
  }: {
    record: StudentRecord;
    degreeImportService: DegreeImportService;
  } = $props();

  let fileInput = $state<HTMLInputElement | null>(null);

  // A re-import runs over the record already on screen, so its progress and
  // failure show here rather than swapping the page for the import view.
  const parsing = $derived(degreeState.status === 'parsing');
  const error = $derived(
    degreeState.status === 'error' ? degreeState.errorMessage : null,
  );

  const required = $derived(record.credits.required);
  // Overall progress = completed (earned, incl. transfer) toward the degree total.
  const overallPct = $derived(
    required && required > 0
      ? Math.min(100, Math.round((record.credits.earned / required) * 100))
      : null,
  );

  // Where the degree lands: the transcript plus the active schedule's courses
  // Workday does not already list.
  const plan = $derived(projectPlan(record, appState.selectedCourses));
  const projected = $derived(
    record.credits.earned + record.credits.inProgress + plan.credits,
  );
  const pctOf = (credits: number): number | null =>
    required && required > 0
      ? Math.min(100, Math.round((credits / required) * 100))
      : null;
  const projectedPct = $derived(pctOf(projected));
  // Each step adds to the last: earned, then in progress, then scheduled.
  const withInProgressPct = $derived(
    pctOf(record.credits.earned + record.credits.inProgress),
  );
  const progressLabel = $derived.by(() => {
    let label = `${overallPct}% of ${required} credits`;
    let shown = overallPct ?? 0;
    if (withInProgressPct !== null && withInProgressPct > shown) {
      label += ` \u00b7 ${withInProgressPct}% with in progress`;
      shown = withInProgressPct;
    }
    if (projectedPct !== null && projectedPct > shown)
      label += ` \u00b7 ${projectedPct}% with schedule`;
    return label;
  });
  const stillNeeded = $derived(
    required ? Math.max(0, Math.round((required - projected) * 100) / 100) : 0,
  );

  // The bar's three parts, in the cards' colours: completed, in progress, and
  // scheduled - each clamped to what is left of the bar.
  const segments = $derived.by(() => {
    if (!required || required <= 0) return null;
    const earned = Math.min(record.credits.earned / required, 1);
    const inProgress = Math.min(
      record.credits.inProgress / required,
      1 - earned,
    );
    const planned = Math.min(plan.credits / required, 1 - earned - inProgress);
    return { earned, inProgress, planned };
  });

  // Requirements met once the placed courses count - the cards' live status -
  // out of the ones a course can be placed in (not the degree-wide aggregates).
  const requirements = $derived.by(() => {
    const listed = degreeState.buckets.filter(
      b => !UMBRELLA_CATEGORIES.has(b.category),
    );
    const met = listed.filter(
      b => degreeState.progressById.get(b.id)?.status === 'satisfied',
    ).length;
    return { met, total: listed.length };
  });

  const planNote = $derived(
    plan.courses
      ? `With ${plan.courses} scheduled course${plan.courses === 1 ? '' : 's'}: ${projectedPct ?? 0}% of ${required} credits, ${stillNeeded} credits still needed.`
      : null,
  );

  const title = $derived(
    [record.major, record.degree].filter(Boolean).join(' · ') ||
      'Academic Progress',
  );

  // Phone only: the card folds to its title and overall progress, with the
  // stats a tap away and the record's actions behind a ⋯ menu - on a phone
  // the full card was 356px, a whole screen's worth before any requirement.
  let statsOpen = $state(false);
  let menuOpen = $state(false);
  let menuTrigger = $state<HTMLButtonElement | null>(null);

  function runFromMenu(action: () => void): () => void {
    return () => {
      menuOpen = false;
      action();
    };
  }

  function clearRecord(): void {
    showConfirm({
      title: 'Clear degree record',
      message: 'Are you sure you want to do this?',
      confirmLabel: 'Clear',
      variant: 'danger',
      onConfirm: () => degreeImportService.clear(),
    });
  }

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

{#snippet bar(extra: string)}
  <div
    class="degree-progress-bar {extra}"
    role="img"
    aria-label={progressLabel}
  >
    <div
      class="degree-progress-seg seg-earned"
      style:width="{(segments?.earned ?? 0) * 100}%"
    ></div>
    <div
      class="degree-progress-seg seg-planned"
      style:width="{(segments?.inProgress ?? 0) * 100}%"
    ></div>
    <div
      class="degree-progress-seg seg-schedule"
      style:width="{(segments?.planned ?? 0) * 100}%"
    ></div>
  </div>
{/snippet}

{#snippet stats()}
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
      <span class="degree-stat-value">{plan.credits}</span><span
        class="degree-stat-label">Scheduled</span
      >
    </div>
    <div class="degree-stat">
      <span class="degree-stat-value"
        >{requirements.met}/{requirements.total}</span
      ><span class="degree-stat-label">Satisfied</span>
    </div>
  </div>
{/snippet}

{#snippet planDetails()}
  {#if planNote}
    <p class="degree-plan-note" id="degree-plan-note">{planNote}</p>
  {/if}
{/snippet}

{#if phoneLayout.current}
  <section class="degree-summary degree-summary-compact">
    <div class="degree-summary-line">
      <button
        type="button"
        class="degree-summary-toggle"
        aria-expanded={statsOpen}
        onclick={() => (statsOpen = !statsOpen)}
      >
        <span class="degree-summary-title">{title}</span>
        <span class="degree-summary-pct">
          {#if overallPct !== null}{overallPct}% of {required} cr{:else}Credits{/if}
          {@html getInlineSVG('CHEVRON_DOWN', 'degree-summary-chevron')}
        </span>
      </button>
      <div class="degree-summary-more">
        <button
          type="button"
          class="degree-summary-more-btn"
          id="degree-summary-more-btn"
          aria-label="Degree record actions"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          bind:this={menuTrigger}
          onclick={() => (menuOpen = !menuOpen)}>&#8943;</button
        >
        {#if menuOpen}
          <div
            class="degree-summary-menu"
            role="menu"
            transition:scaleFade={{ duration: 150 }}
            use:clickOutside={{
              onOutside: () => (menuOpen = false),
              ignore: menuTrigger,
            }}
          >
            <button
              type="button"
              role="menuitem"
              class="assign-menu-item"
              id="degree-configure-buckets-btn"
              onclick={runFromMenu(() => openModal('bucket-config'))}
              >Configure buckets</button
            >
            <button
              type="button"
              role="menuitem"
              class="assign-menu-item"
              disabled={parsing}
              onclick={runFromMenu(() => fileInput?.click())}>Re-import</button
            >
            <button
              type="button"
              role="menuitem"
              class="assign-menu-item is-danger"
              onclick={runFromMenu(clearRecord)}>Clear record</button
            >
          </div>
        {/if}
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

    {#if segments}
      {@render bar('degree-summary-bar')}
    {/if}

    {#if parsing}
      <p class="degree-dropzone-status" role="status">Reading file…</p>
    {:else if error}
      <p class="degree-dropzone-error" role="alert">
        Re-import failed: {error}
      </p>
    {/if}

    {#if statsOpen}
      <div transition:slideFade={{ duration: 180 }}>
        {#if record.startYear}
          <p class="degree-summary-sub">Entered {record.startYear}</p>
        {/if}
        {@render stats()}
        {@render planDetails()}
      </div>
    {/if}
  </section>
{:else}
  <section class="degree-summary">
    <div class="degree-summary-head">
      <div>
        <h2 class="degree-summary-title">{title}</h2>
        {#if record.startYear}
          <p class="degree-summary-sub">Entered {record.startYear}</p>
        {/if}
      </div>
      <div class="degree-summary-actions">
        <button
          type="button"
          class="btn btn-primary"
          id="degree-configure-buckets-btn"
          onclick={() => openModal('bucket-config')}>Configure buckets</button
        >
        <button
          type="button"
          class="btn btn-secondary"
          disabled={parsing}
          onclick={() => fileInput?.click()}>Re-import</button
        >
        <button type="button" class="btn btn-secondary" onclick={clearRecord}
          >Clear</button
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

    {#if parsing}
      <p class="degree-dropzone-status" role="status">Reading file…</p>
    {:else if error}
      <p class="degree-dropzone-error" role="alert">
        Re-import failed: {error}
      </p>
    {/if}

    {#if segments}
      <div class="degree-progress">
        {@render bar('')}
        <span class="degree-progress-label">{progressLabel}</span>
      </div>
    {/if}

    {@render stats()}
    {@render planDetails()}
  </section>
{/if}
