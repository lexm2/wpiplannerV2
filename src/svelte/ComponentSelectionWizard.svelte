<script lang="ts">
  // Svelte rewrite of the old vanilla ComponentSelectionWizard. Same features:
  // dynamic steps, breadcrumb jumps, directional slide-in with staggered cards,
  // term grouping, async/RMP/seat badges, toggle-select, Skip/Next/Finish footer,
  // filter status + hidden/year notices, live + hover grid preview, escape-to-cancel.
  //
  // All the imperative DOM-swapping the class did by hand is now plain $derived
  // reactivity over wizardState.{currentStep,selections} + the active filters.
  import { fade } from 'svelte/transition';
  import { slideX, dur } from './transitions';
  import { wizardState } from './wizardState.svelte';
  import { showConfirm } from './modals/modalState.svelte';
  import {
    determineAvailableSteps,
    getOptionsWithFilterInfo,
    groupSectionsByTerm,
    getTermName,
    isAsyncPeriod,
    getSeatsInfo,
    getRmpRatingClass,
    describeActiveFilters,
    getYearMismatch,
  } from './wizardLogic';
  import { rateMyProfessorService } from '../services/external/RateMyProfessorService';
  import { getInlineSVG } from '../utils/iconPaths';
  import type { Section } from '../types/types';
  import type { ComponentSelections } from '../types/scheduling';
  import type { WizardStep } from '../types/uiState';
  import styles from '../styles/components/component-wizard.module.css';

  // Snapshot the config for this open — the host {#if} mounts a fresh instance per
  // launch, so this is stable for the component's lifetime and survives the close
  // fade-out (when the store nulls config).
  const cfg = wizardState.config!;
  const { course, courseDataService, filterService } = cfg;
  const isLabOnly = courseDataService.isLabOnlyCourse(course);

  const STEP_LABELS: Record<WizardStep, string> = {
    lecture: isLabOnly ? 'Lab Section' : 'Lecture',
    discussion: 'Discussion',
    lab: 'Lab',
  };
  const STEP_TITLES: Record<WizardStep, string> = {
    lecture: isLabOnly ? 'Select Lab Section' : 'Select Lecture',
    discussion: 'Select Discussion',
    lab: 'Select Lab',
  };

  const currentStep = $derived(wizardState.currentStep);
  const selections = $derived(wizardState.selections);

  // Recomputes when the chosen lecture changes (drives breadcrumbs + navigation).
  const availableSteps = $derived(
    determineAvailableSteps(course, courseDataService, selections.lecture),
  );

  // Reads filterService.getActiveFilters() transitively, so it re-runs live when
  // filters change — this replaces the old watch()/onFilterChange()/rerender().
  const optionInfo = $derived(
    getOptionsWithFilterInfo(course, courseDataService, filterService, currentStep, selections),
  );
  const hiddenCount = $derived(optionInfo.totalBeforeFilter - optionInfo.filtered.length);

  // Term groups with a running card index for the stagger animation.
  const termGroups = $derived.by(() => {
    let offset = 0;
    return groupSectionsByTerm(optionInfo.filtered).map((g) => {
      const startIndex = offset;
      offset += g.sections.length;
      return { ...g, startIndex };
    });
  });

  const filterDescriptions = $derived(describeActiveFilters(filterService));
  const yearMismatch = $derived(getYearMismatch(course, filterService));

  const currentIndex = $derived(availableSteps.indexOf(currentStep));
  const isFirstStep = $derived(currentIndex === 0);
  const isLastStep = $derived(currentIndex === availableSteps.length - 1);
  const hasSelection = $derived(selections[currentStep] !== null);
  // Steps (and their staggered cards) slide in from the side matching the
  // navigation direction.
  const dirSign = $derived(wizardState.direction === 'forward' ? 1 : -1);

  function selectSection(section: Section): void {
    const step = currentStep;
    const isSame = selections[step]?.crn === section.crn;

    if (step === 'lecture') {
      // Picking/clearing a lecture always resets dependent discussion/lab.
      wizardState.selections = isSame
        ? { lecture: null, discussion: null, lab: null }
        : { lecture: section, discussion: null, lab: null };
    } else {
      wizardState.selections = { ...selections, [step]: isSame ? null : section };
    }

    cfg.onSelectionChange?.(wizardState.selections);
  }

  function next(): void {
    if (currentIndex < availableSteps.length - 1) {
      wizardState.jumpToStep(availableSteps[currentIndex + 1]);
    }
  }

  function prev(): void {
    if (currentIndex > 0) {
      wizardState.jumpToStep(availableSteps[currentIndex - 1]);
    }
  }

  function tryComplete(): void {
    const missing = availableSteps
      .filter((step) => selections[step] === null)
      .map((step) =>
        step === 'lecture' ? 'a lecture' : step === 'discussion' ? 'a discussion section' : 'a lab section',
      );
    if (missing.length > 0) {
      showConfirm({
        title: 'Incomplete course',
        message: `You still need to select ${missing.join(' and ')}. Finish anyway?`,
        confirmLabel: 'Finish anyway',
        onConfirm: () => cfg.onComplete(wizardState.selections),
      });
      return;
    }
    cfg.onComplete(wizardState.selections);
  }

  function cancel(): void {
    cfg.onCancel();
  }

  function clearFilters(): void {
    if (!filterService) return;
    const activeYear = filterService.getCriteria<{ year?: number }>('academicYear')?.year;
    filterService.resetFilters(typeof activeYear === 'number' ? activeYear : undefined);
  }

  function switchYear(): void {
    if (filterService && course.academicYear) {
      filterService.updateFilter('academicYear', { year: course.academicYear });
    }
  }

  function hoverPreview(section: Section): void {
    if (!cfg.onHoverPreview) return;
    const preview: ComponentSelections = {
      lecture: currentStep === 'lecture' ? section : null,
      discussion: currentStep === 'discussion' ? section : null,
      lab: currentStep === 'lab' ? section : null,
    };
    cfg.onHoverPreview(preview);
  }

  function clearHoverPreview(): void {
    cfg.onSelectionChange?.(wizardState.selections);
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') cancel();
  }

  // The sidebar content hides its overflow and footer while a panel is open
  // (mirrors the old BaseSidebarPanel behavior).
  $effect(() => {
    const el = document.getElementById('schedule-sidebar-content');
    // The panel is absolutely positioned at top:0 inside this scroll container,
    // so reset the scroll to the top before locking overflow — otherwise, if the
    // sidebar was scrolled down, the panel renders above the visible area and the
    // overflow lock leaves no way to scroll up to it. Restore on close.
    const prevScrollTop = el?.scrollTop ?? 0;
    if (el) el.scrollTop = 0;
    el?.classList.add('wizard-active');
    return () => {
      el?.classList.remove('wizard-active');
      if (el) el.scrollTop = prevScrollTop;
    };
  });
</script>

<svelte:window onkeydown={onKeydown} />

<!-- `|global` because WizardHost's {#if} unmounts us from an ancestor block, so a
     local outro would never play — the panel would just vanish. -->
<div
  class={["sidebar-panel", styles['sidebar-panel--component-wizard']]}
  transition:fade|global={{ duration: dur(250) }}
>
  <div class={styles['wizard-header']}>
    <button class={styles['wizard-close-btn']} onclick={cancel} aria-label="Close">&times;</button>
    <h2>{course.departmentAbbr} {course.number}</h2>
    <div class={styles['wizard-course-name']}>{course.name}</div>
  </div>

  {#if filterDescriptions.length > 0}
    <div class={styles['wizard-filter-status']}>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class={styles['filter-icon']}>
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M20 3h-16a1 1 0 0 0 -1 1v2.227l.008 .223a3 3 0 0 0 .772 1.795l4.22 4.641v8.114a1 1 0 0 0 1.316 .949l6 -2l.108 -.043a1 1 0 0 0 .576 -.906v-6.586l4.121 -4.12a3 3 0 0 0 .879 -2.123v-2.171a1 1 0 0 0 -1 -1z" />
      </svg>
      <span class={styles['filter-text']}>
        Filters:
        {#each filterDescriptions as desc, i}
          {#if i > 0}<span class={styles['filter-separator']}>●</span>{/if}{desc}
        {/each}
      </span>
    </div>
  {/if}

  {#if availableSteps.length > 1}
    <div class={styles['wizard-breadcrumbs']}>
      {#each availableSteps as step, i (step)}
        {#if i > 0}
          <span class={styles['breadcrumb-arrow']}>{@html getInlineSVG('ARROW_BAR_RIGHT', 'breadcrumb-arrow-icon')}</span>
        {/if}
        <button
          class={[styles['wizard-breadcrumb'], { [styles['active']]: step === currentStep, [styles['completed']]: selections[step] !== null }]}
          disabled={step === currentStep}
          onclick={() => wizardState.jumpToStep(step)}
        >
          <span class={styles['breadcrumb-label']}>{STEP_LABELS[step]}</span>
          {#if selections[step] !== null}<span class={styles['breadcrumb-check']}>✓</span>{/if}
        </button>
      {/each}
    </div>
  {/if}

  <div class={styles['wizard-content']}>
    {#key currentStep}
      <div
        class={styles['wizard-step']}
        data-step={currentStep}
        in:slideX|global={{ from: dirSign, duration: 250 }}
      >
        {#if optionInfo.filtered.length === 0}
          {@render filteredNotice()}
        {:else}
          <h3 class={styles['wizard-step-title']}>{STEP_TITLES[currentStep]}</h3>
          {#each termGroups as group (group.term)}
            <div class={styles['wizard-term-separator']}>{getTermName(group.term)}</div>
            <div class={styles['wizard-sections-grid']}>
              {#each group.sections as section, i (section.crn)}
                {@const period = section.periods[0]}
                {@const isAsync = isAsyncPeriod(period)}
                {@const professor = period?.professor || 'Not Assigned'}
                {@const rmp = professor !== 'Not Assigned' ? rateMyProfessorService.getRatingDisplay(professor) : null}
                {@const rmpUrl = professor !== 'Not Assigned' ? rateMyProfessorService.getProfessorRMPUrl(professor) : null}
                {@const selected = selections[currentStep]?.crn === section.crn}
                <div
                  class={[styles['wizard-section-card'], { [styles['selected']]: selected }]}
                  data-crn={section.crn}
                  in:slideX|global={{ from: dirSign, duration: 250, delay: (group.startIndex + i) * 40 }}
                  onintroend={(e) => (e.currentTarget as HTMLElement).setAttribute('data-settled', '')}
                  role="button"
                  tabindex="0"
                  onclick={() => selectSection(section)}
                  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), selectSection(section))}
                  onmouseenter={() => hoverPreview(section)}
                  onmouseleave={clearHoverPreview}
                >
                  <div class={styles['section-card-header']}>
                    <span class={styles['section-card-number']}>{section.number}</span>
                  </div>

                  {#if isAsync}
                    <div class={styles['section-card-async-badge']}>
                      {@html getInlineSVG('CLOCK', 'async-icon')}
                      Asynchronous
                    </div>
                  {:else}
                    <div class={styles['section-card-time']}>
                      <strong>{period ? Array.from(period.days).join('') : 'TBA'}</strong>
                      {period ? `${period.startTime.displayTime} - ${period.endTime.displayTime}` : 'TBA'}
                    </div>
                    <div class={styles['section-card-location']}>{period?.location || 'TBA'}</div>
                  {/if}

                  <div class={styles['section-card-professor']}>
                    {#if rmpUrl}
                      <a href={rmpUrl} target="_blank" rel="noopener noreferrer" class="professor-link">{professor}</a>
                    {:else}
                      {professor}
                    {/if}
                    {#if rmp}
                      <div class={styles['rmp-badge']} title="Rate My Professor: {rmp.rating}/5.0 ({rmp.numRatings} ratings)">
                        <span class={[styles['rmp-rating'], styles[getRmpRatingClass(rmp.rating)]]}>★ {rmp.rating}</span>
                        <span class={styles['rmp-details']}>
                          {rmp.difficulty}/5 difficulty{rmp.wouldTakeAgain ? ` • ${rmp.wouldTakeAgain} would take again` : ''}
                        </span>
                      </div>
                    {/if}
                  </div>

                  <div class={styles['section-card-footer']}>
                    <span class={[styles['section-card-seats'], { [styles['full']]: section.seatsAvailable === 0 }]}>
                      {getSeatsInfo(section)}
                    </span>
                    <span class={styles['section-card-crn']}>CRN: {section.crn}</span>
                  </div>

                  {#if selected}<div class={styles['section-card-selected-badge']}>✓ Selected</div>{/if}
                </div>
              {/each}
            </div>
          {/each}

          {#if hiddenCount > 0}
            {@render filteredNotice()}
          {/if}
        {/if}
      </div>
    {/key}
  </div>

  <div class={styles['wizard-footer']}>
    <button
      class={[styles['wizard-btn'], styles['wizard-btn-secondary']]}
      onclick={prev}
      style:visibility={isFirstStep ? 'hidden' : 'visible'}
    >
      Back
    </button>
    <button class={[styles['wizard-btn'], styles['wizard-btn-text']]} onclick={cancel}>Cancel</button>
    {#if hasSelection || isLastStep}
      <button
        id="wizard-next-btn"
        class={[styles['wizard-btn'], styles['wizard-btn-primary']]}
        onclick={() => (isLastStep ? tryComplete() : next())}
      >
        {isLastStep ? 'Finish' : 'Next'}
      </button>
    {:else}
      <button class={[styles['wizard-btn'], styles['wizard-btn-secondary']]} onclick={next}>Skip</button>
    {/if}
  </div>
</div>

{#snippet filteredNotice()}
  {#if yearMismatch}
    <div class={styles['wizard-filtered-notice']}>
      <span class={styles['wizard-filtered-notice-text']}>
        This course is from {yearMismatch.courseYear}–{yearMismatch.courseYear + 1} but you're viewing
        {yearMismatch.filterYear}–{yearMismatch.filterYear + 1}
      </span>
      <button class={styles['wizard-filtered-notice-btn']} onclick={switchYear}>
        Switch to {yearMismatch.courseYear}–{yearMismatch.courseYear + 1}
      </button>
    </div>
  {:else}
    <div class={styles['wizard-filtered-notice']}>
      <span class={styles['wizard-filtered-notice-text']}>
        {hiddenCount} {hiddenCount === 1 ? 'section' : 'sections'} hidden by filters
      </span>
      <button class={styles['wizard-filtered-notice-btn']} onclick={clearFilters}>Clear Filters</button>
    </div>
  {/if}
{/snippet}
