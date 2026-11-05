<script lang="ts">
  import { appState } from '../../core/state/appState.svelte';
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
  import { autoScheduleService } from '../../services/scheduling/autoScheduleService';

  let {
    mode,
    onGenerate,
    coursesToSchedule,
    filterService,
    courseSelectionService,
    autoScheduleOrchestrator,
    getDepartments,
    requestClose,
  }: {
    mode: 'filter' | 'auto-schedule';
    onGenerate?: () => void;
    coursesToSchedule?: SelectedCourse[];
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
  const title = $derived(isAuto ? 'Auto-Schedule Settings' : 'Filter Courses');
  const primaryLabel = $derived(isAuto ? 'Generate Schedule' : 'Apply');

  // Filter-count badge: only shown when filters differ from the
  // schedule-year default.
  const activeYear = $derived(appState.activeSchedule?.year);
  const filterCount = $derived(
    isAuto
      ? countAutoScheduleFilters(
          filterService.getActiveFilters(),
          appState.preferences.avoidCalendarEvents,
        )
      : filterService.hasNonDefaultFilters(activeYear)
        ? filterService.getFilterCount()
        : 0,
  );

  const advancedCount = $derived(
    countAdvancedFilters(filterService.getActiveFilters(), activeYear),
  );

  const previewText = $derived.by(() => {
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
    filterService.resetFilters(activeYear);
    if (isAuto) autoScheduleService.setAvoidCalendarEvents(true);
    resetNonce++;
  }
</script>

{#snippet essentialFilters()}
  <TermsFilter {filterService} {allCourses} />
  <!-- Auto-Schedule works on the courses already chosen, so it skips the
       filters that decide which courses are listed. -->
  {#if !isAuto}
    <CourseLevelFilter {filterService} />
  {/if}
  <AvailabilityFilter {filterService} {courseSelectionService} />
{/snippet}

{#snippet advancedFilters()}
  {#if !isAuto}
    <AcademicYearFilter {filterService} {allCourses} />
    <DepartmentFilter {filterService} {allCourses} />
  {/if}
  <TimesFilter {filterService} />
  {#if !isAuto}
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
  <button class="modal-close" aria-label="Close" onclick={requestClose}
    >×</button
  >
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
  <div class="filter-preview">
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
