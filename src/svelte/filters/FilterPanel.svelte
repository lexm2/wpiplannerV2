<script lang="ts">
  import { appState } from '../../core/state/appState.svelte';
  import {
    FILTER_WINDOW_TITLES,
    type FilterMode,
  } from '../modals/modalState.svelte';
  import CloseButton from '../ui/CloseButton.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { CourseSelectionService } from '../../services/selection/CourseSelectionService';
  import type { AutoScheduleOrchestrator } from '../../services/scheduling/AutoScheduleOrchestrator';
  import type { Department } from '../../types/types';
  import type { SelectedCourse } from '../../types/schedule';

  import RankingPreferences from './RankingPreferences.svelte';
  import TermsFilter from './TermsFilter.svelte';
  import CourseLevelFilter from './CourseLevelFilter.svelte';
  import AcademicYearFilter from './AcademicYearFilter.svelte';
  import AvailabilityFilter from './AvailabilityFilter.svelte';
  import AvailabilityDetailsFilter from './AvailabilityDetailsFilter.svelte';
  import DepartmentFilter from './DepartmentFilter.svelte';
  import TimesFilter from './TimesFilter.svelte';
  import CreditHoursFilter from './CreditHoursFilter.svelte';
  import RmpRatingFilter from './RmpRatingFilter.svelte';
  import MoreSection from '../ui/MoreSection.svelte';
  import { countAdvancedFilters } from '../../services/filtering/advancedFilterCount';
  import { countAutoScheduleFilters } from '../../services/scheduling/autoScheduleFilterCount';
  import { NON_SECTION_FILTER_IDS } from '../../services/scheduling/AutoScheduler';
  import {
    clearSectionFilters,
    sectionFilters,
  } from '../../services/filtering/sectionFilters';
  import { autoScheduleService } from '../../services/scheduling/autoScheduleService';

  let {
    mode,
    onGenerate,
    coursesToSchedule,
    sectionsShown,
    filterService,
    courseSelectionService,
    autoScheduleOrchestrator,
    getDepartments,
    requestClose,
  }: {
    mode: FilterMode;
    onGenerate?: () => void;
    coursesToSchedule?: SelectedCourse[];
    sectionsShown?: () => { shown: number; total: number };
    filterService: FilterService;
    courseSelectionService: CourseSelectionService;
    autoScheduleOrchestrator: AutoScheduleOrchestrator;
    getDepartments: () => Department[];
    requestClose: () => void;
  } = $props();

  // Flatten departments -> courses (the section components read filter options
  // off this). Reactive so it picks up a late course-data load.
  const allCourses = $derived(getDepartments().flatMap(d => d.courses));

  const isAuto = $derived(mode === 'auto-schedule');
  const isSections = $derived(mode === 'sections');
  const title = $derived(FILTER_WINDOW_TITLES[mode]);
  const primaryLabel = $derived(isAuto ? 'Generate Schedule' : 'Done');

  const activeYear = $derived(appState.activeSchedule?.year);
  const filterCount = $derived.by(() => {
    if (isAuto) {
      return countAutoScheduleFilters(
        filterService.getActiveFilters(),
        appState.preferences.avoidCalendarEvents,
      );
    }
    return isSections
      ? sectionFilters(filterService.getActiveFilters()).length
      : filterService.getFilterCount(activeYear);
  });

  // In the picker the year isn't a filter at all, so there's no default to compare it to.
  const advancedCount = $derived(
    isSections
      ? countAdvancedFilters(
          sectionFilters(filterService.getActiveFilters()),
          undefined,
        )
      : countAdvancedFilters(filterService.getActiveFilters(), activeYear),
  );

  const previewText = $derived.by(() => {
    if (sectionsShown) {
      const { shown, total } = sectionsShown();
      return `${shown} of ${total} ${total === 1 ? 'section' : 'sections'} shown`;
    }
    if (isAuto) {
      const selected =
        coursesToSchedule ?? courseSelectionService.getSelectedCourses();
      if (selected.length === 0) return 'No courses selected';
      const courses = selected.map(sc => sc.course);
      // Same filters Generate applies, so the preview can't read "0 sections"
      // for a run that succeeds.
      const sections = filterService.applyExcluding(
        courses,
        NON_SECTION_FILTER_IDS,
      );
      const uniqueCourses = new Set(sections.map(fs => fs.course.id)).size;
      return `${sections.length} sections across ${uniqueCourses} courses available`;
    }
    const count = filterService.filterCourses(allCourses).length;
    return `${count} courses match current filters`;
  });

  // Rate My Professor debounces its writes; flushed before anything reads the
  // criteria or resets them.
  let rmpFilter = $state<ReturnType<typeof RmpRatingFilter>>();

  function onPrimary(): void {
    rmpFilter?.flush();
    if (isAuto && onGenerate) {
      requestClose();
      onGenerate();
    } else {
      requestClose();
    }
  }

  // The service-derived sections reset reactively, but RmpRatingFilter seeds its
  // slider positions once at mount - bump this to remount it so the thumbs snap
  // back to defaults.
  let resetNonce = $state(0);

  function onClearAll(): void {
    // Otherwise the remount's flush would write the old values over the reset.
    rmpFilter?.flush();
    if (isSections) clearSectionFilters(filterService);
    else filterService.resetFilters(activeYear);
    if (isAuto) autoScheduleService.setAvoidCalendarEvents(true);
    resetNonce++;
  }
</script>

{#snippet essentialFilters()}
  <TermsFilter {filterService} {allCourses} />
  <!-- Auto-Schedule and the section picker work on courses already chosen, so
       they skip the filters that decide which courses are listed. -->
  {#if mode === 'filter'}
    <CourseLevelFilter {filterService} />
  {/if}
  <AvailabilityFilter {filterService} {courseSelectionService} />
{/snippet}

{#snippet advancedFilters()}
  {#if mode === 'filter'}
    <AcademicYearFilter {filterService} {allCourses} />
    <DepartmentFilter {filterService} {allCourses} />
  {/if}
  <TimesFilter {filterService} />
  {#if mode === 'filter'}
    <CreditHoursFilter {filterService} />
  {/if}
  <AvailabilityDetailsFilter
    {filterService}
    {courseSelectionService}
    {autoScheduleOrchestrator}
    {mode}
  />
  {#key resetNonce}
    <RmpRatingFilter {filterService} bind:this={rmpFilter} />
  {/key}
{/snippet}

<div class="modal-header">
  <h3 class="modal-title">
    {title}
    <span class="filter-count">{filterCount > 0 ? `(${filterCount})` : ''}</span
    >
  </h3>
  <CloseButton onclick={requestClose} />
</div>

<div class="modal-body filter-modal-body">
  <div class="filter-sections">
    {#if isAuto}
      <RankingPreferences />
      <MoreSection
        id="auto-schedule-filters"
        label="Filters"
        activeCount={filterCount}
      >
        {@render essentialFilters()}
        {@render advancedFilters()}
      </MoreSection>
    {:else}
      {@render essentialFilters()}
      <MoreSection
        id="more-filters"
        label="More filters"
        activeCount={advancedCount}
      >
        {@render advancedFilters()}
      </MoreSection>
    {/if}
  </div>
</div>

<div class="modal-footer">
  <div class="filter-preview" role="status">
    <span>{previewText}</span>
  </div>
  <div class="filter-actions">
    <button class="modal-btn btn-secondary" onclick={onClearAll}
      >Clear All</button
    >
    <button
      id="modal-primary-btn"
      class="modal-btn btn-primary"
      onclick={onPrimary}>{primaryLabel}</button
    >
  </div>
</div>
