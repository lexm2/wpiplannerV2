<script lang="ts">
  import { appState } from '../../core/state/appState.svelte';
  import type { FilterService } from '../../services/filtering/FilterService';
  import type { CourseSelectionService } from '../../services/selection/CourseSelectionService';
  import type { AutoScheduleOrchestrator } from '../../services/scheduling/AutoScheduleOrchestrator';
  import type { ProfileStateManager } from '../../core/state/ProfileStateManager';
  import type { Department } from '../../types/types';
  import type { SelectedCourse } from '../../types/schedule';

  import CourseLevelFilter from './CourseLevelFilter.svelte';
  import AcademicYearFilter from './AcademicYearFilter.svelte';
  import BookmarksFilter from './BookmarksFilter.svelte';
  import AvailabilityFilter from './AvailabilityFilter.svelte';
  import DepartmentFilter from './DepartmentFilter.svelte';
  import WakeTimeFilter from './WakeTimeFilter.svelte';
  import CreditHoursFilter from './CreditHoursFilter.svelte';
  import RmpRatingFilter from './RmpRatingFilter.svelte';

  let {
    mode,
    onGenerate,
    coursesToSchedule,
    filterService,
    courseSelectionService,
    autoScheduleOrchestrator,
    profileStateManager,
    getDepartments,
    requestClose,
  }: {
    mode: 'filter' | 'auto-schedule';
    onGenerate?: () => void;
    coursesToSchedule?: SelectedCourse[];
    filterService: FilterService;
    courseSelectionService: CourseSelectionService;
    autoScheduleOrchestrator: AutoScheduleOrchestrator;
    profileStateManager: ProfileStateManager;
    getDepartments: () => Department[];
    requestClose: () => void;
  } = $props();

  // Flatten departments -> courses (the section components read filter options
  // off this). Reactive so it picks up a late course-data load.
  const allCourses = $derived(getDepartments().flatMap(d => d.courses));

  const isAuto = $derived(mode === 'auto-schedule');
  const title = $derived(isAuto ? 'Auto-Schedule Settings' : 'Filter Courses');
  const primaryLabel = $derived(isAuto ? 'Generate Schedule' : 'Apply');

  // Filter-count badge: only shown when filters differ from the schedule-year
  // default (mirrors the controller's hasNonDefaultFilters gate).
  const activeYear = $derived(appState.activeSchedule?.year);
  const filterCount = $derived(
    filterService.hasNonDefaultFilters(activeYear)
      ? filterService.getFilterCount()
      : 0,
  );

  const previewText = $derived.by(() => {
    if (isAuto) {
      if (!autoScheduleOrchestrator) return 'Configure filters then generate';
      const selected =
        coursesToSchedule ?? courseSelectionService.getSelectedCourses() ?? [];
      if (selected.length === 0) return 'No courses selected';
      const courses = selected.map(sc => sc.course);
      const sections = filterService.apply(courses);
      const uniqueCourses = new Set(sections.map(fs => fs.course.id)).size;
      return `${sections.length} sections across ${uniqueCourses} courses available`;
    }
    const count = filterService.filterCourses(allCourses).length;
    return `${count} courses match current filters`;
  });

  function onPrimary(): void {
    if (isAuto && onGenerate) {
      requestClose();
      onGenerate();
    } else {
      requestClose();
    }
  }

  // The service-derived sections reset reactively, but RmpRatingFilter seeds its
  // slider positions once at mount - bump this to remount it so the thumbs snap
  // back to defaults (the old controller rebuilt the whole panel on Clear All).
  let resetNonce = $state(0);

  function onClearAll(): void {
    filterService.resetFilters(activeYear);
    resetNonce++;
  }
</script>

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
    <CourseLevelFilter {filterService} {allCourses} />
    <AcademicYearFilter {filterService} {profileStateManager} {allCourses} />
    <BookmarksFilter {filterService} />
    <AvailabilityFilter
      {filterService}
      {courseSelectionService}
      {autoScheduleOrchestrator}
    />
    <DepartmentFilter {filterService} {allCourses} />
    <WakeTimeFilter {filterService} />
    <CreditHoursFilter {filterService} />
    {#key resetNonce}
      <RmpRatingFilter {filterService} />
    {/key}
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
