<script lang="ts">
  import styles from '../styles/components/right-panel.module.css';
  import { untrack } from 'svelte';
  import { wizardState } from './wizardState.svelte';
  import { wizardScrollLock } from './wizardScrollLock';
  import type { PageId } from '../types/uiState';
  import type { Course } from '../types/types';
  import type { SelectedCourse } from '../types/schedule';
  import type { ServiceContainer } from '../bootstrap/ServiceContainer';
  import {
    uiState,
    setPage,
    openModal,
    showAppError,
  } from '../services/ui/uiState.svelte';
  import { appState } from '../core/state/appState.svelte';
  import { modalState } from './modals/modalState.svelte';
  import { componentWizardService } from '../services/scheduling/componentWizardService';
  import { localEventService } from '../services/scheduling/localEventService';
  import { icsDropTarget } from './schedule/icsDropTarget';
  import { fade } from 'svelte/transition';
  import { dur } from './transitions';
  import { sectionInfoService } from '../services/scheduling/sectionInfoService';
  import { autoScheduleService } from '../services/scheduling/autoScheduleService';
  import { timestampState } from './timestampState.svelte';
  import { installAppEffects } from './appEffects.svelte';
  import { installPageSwipe } from './pageSwipe.svelte';
  import { DebouncedOperation } from '../utils/RequestCancellation';

  import DepartmentSidebar from './DepartmentSidebar.svelte';
  import SearchBar from './SearchBar.svelte';
  import FilterButtons from './FilterButtons.svelte';
  import CourseList from './CourseList.svelte';
  import DegreeFilterBanner from './degree/DegreeFilterBanner.svelte';
  import SelectedCoursesPanel from './SelectedCoursesPanel.svelte';
  import { courseListState } from './courseListState.svelte';
  import CourseDescription from './CourseDescription.svelte';
  import PageTabs from './PageTabs.svelte';
  import UndoRedoButtons from './UndoRedoButtons.svelte';
  import ThemeSelector from './ThemeSelector.svelte';
  import SettingsMenu from './SettingsMenu.svelte';
  import CalendarEventsButton from './CalendarEventsButton.svelte';
  import ScheduleFilterButton from './ScheduleFilterButton.svelte';
  import ScheduleSidebar from './ScheduleSidebar.svelte';
  import WizardHost from './WizardHost.svelte';
  import AutoScheduleControls from './AutoScheduleControls.svelte';
  import ScheduleGrids from './schedule/ScheduleGrids.svelte';
  import DegreePage from './degree/DegreePage.svelte';
  import SidePanel from './SidePanel.svelte';
  import DrawerToggle from './DrawerToggle.svelte';
  import ToPlaceButton from './degree/ToPlaceButton.svelte';
  import { degreeState } from './degree/degreeState.svelte';
  import ErrorBanner from './ErrorBanner.svelte';
  import { PANEL_WIDTHS, applyStoredPanelWidths } from './panelWidths';
  import { logger } from '../utils/logger';

  // Restore any saved sidebar widths before first paint to avoid a layout flash.
  applyStoredPanelWidths();

  let { services }: { services: ServiceContainer } = $props();

  // `services` is a stable singleton container (built once in main.ts), so this
  // one-time construction reads it non-reactively; untrack makes that explicit.
  const debouncedSearch = untrack(
    () => new DebouncedOperation(services.operationManager, 'search', 300),
  );

  // Page region display: keep BOTH pages mounted and toggle display off
  // uiState.currentPage. {#if} is avoided so a page's reactive child components
  // are never torn down on a page switch.
  const currentPage = $derived(uiState.currentPage);
  // A file drag is over the schedule grid area.
  let icsDropActive = $state(false);

  const scheduleName = $derived(appState.activeSchedule?.name ?? 'Schedule');

  function handleUndo(): void {
    services.profileStateManager.undo().catch(error => {
      logger.error('Undo failed:', error);
      showAppError('Failed to undo. Please try again.');
    });
  }

  function handleRedo(): void {
    services.profileStateManager.redo().catch(error => {
      logger.error('Redo failed:', error);
      showAppError('Failed to redo. Please try again.');
    });
  }

  // Each page has its own <main>, and only the current page's is displayed, so
  // the link's target depends on the page. Focus there puts the next Tab on the
  // page's first control (the search box, on Classes).
  function skipToMain(e: MouseEvent): void {
    e.preventDefault();
    const page = uiState.currentPage;
    document
      .querySelector<HTMLElement>(`:is(#${page}-page main, main#${page}-page)`)
      ?.focus();
  }

  function openFilterModal(): void {
    modalState.filter = { mode: 'filter' };
    openModal('filter-modal');
  }

  function openSchedulePicker(): void {
    openModal('schedule-picker');
  }

  function switchToPageView(page: PageId): void {
    if (page !== 'schedule') {
      // The wizard belongs to the planner/schedule flow; close it when
      // switching to the classes/planner or degree page.
      componentWizardService.closeComponentWizard();
    }
    setPage(page);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    // Undo would change the schedule hidden behind the modal.
    if (uiState.openModals.length > 0) return;
    // Leave text fields their own native undo.
    const target = e.target as Element | null;
    if (target?.closest?.('input, textarea, select, [contenteditable]')) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      handleRedo();
    }
  }

  // Global side-effect bridges (activation->year filter, page-nav->filter reset,
  // selection->color/auto-schedule, data-load->service sync, active-schedule->
  // tutorial). Extracted to keep this root as pure composition; runs once here so
  // the effects register in this component's scope. Untracked for the same reason
  // as debouncedSearch above: one-time wiring off the stable singleton container.
  untrack(() => installAppEffects(services));

  // Swiping sideways between pages on a phone. Its callbacks read the page
  // when a swipe happens, so the effect itself tracks nothing and runs once.
  $effect(() => installPageSwipe(() => uiState.currentPage, switchToPageView));

  // A newly picked course opens at its title, not wherever the last one was
  // scrolled to.
  let descriptionEl = $state<HTMLElement | null>(null);
  $effect(() => {
    courseListState.selectedCourseId;
    descriptionEl?.scrollTo({ top: 0 });
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<a class="skip-link" href="#main" onclick={skipToMain}>Skip to main content</a>

<ErrorBanner />

<header class="app-header">
  <div class="header-content">
    <div class="header-left">
      <h1>WPI Course Planner</h1>
      <div class="header-subtitle">
        <div class="timestamps-container">
          <span id="client-timestamp">{timestampState.clientLabel}</span>
          <span id="server-timestamp">{timestampState.serverLabel}</span>
        </div>
      </div>
    </div>
    <!-- The page's left panel, where it is a drawer. -->
    <div class="header-drawer-toggle">
      {#if currentPage === 'planner'}
        <DrawerToggle drawer="departments" label="Departments" side="left" />
      {:else if currentPage === 'schedule'}
        <DrawerToggle
          drawer="schedule"
          label="Courses"
          side="left"
          icon="list"
          count={appState.selectedCourses.length}
        />
      {:else if currentPage === 'degree' && degreeState.record}
        <ToPlaceButton />
      {/if}
    </div>
    <nav class="header-navigation" aria-label="Main navigation">
      <div class="nav-tabs-pill">
        <PageTabs onSwitch={switchToPageView} />
      </div>
    </nav>
    <div class="header-controls">
      <div class="undo-redo-controls">
        <UndoRedoButtons onUndo={handleUndo} onRedo={handleRedo} />
      </div>
      <button
        id="schedule-picker-btn"
        class="btn btn-icon"
        title="Select Schedule"
        onclick={openSchedulePicker}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span id="schedule-picker-label">{scheduleName}</span>
      </button>
      <div class="theme-selector">
        <ThemeSelector />
      </div>
      <SettingsMenu
        scheduleManagementService={services.scheduleManagementService}
        getTutorial={() => services.tutorial}
        onSchedules={openSchedulePicker}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
    </div>
  </div>
</header>

<div
  class="app-body"
  id="planner-page"
  style:display={currentPage === 'planner' ? 'grid' : 'none'}
>
  <SidePanel
    class="sidebar"
    label="Department navigation"
    drawer={{ id: 'departments', title: 'Departments' }}
    config={PANEL_WIDTHS.sidebar}
    edge="right"
    resizeLabel="Resize department sidebar"
  >
    <div class="department-categories" id="department-list">
      <DepartmentSidebar filterService={services.filterService} />
    </div>
  </SidePanel>

  <main class="main-content" tabindex="-1">
    <div class="content-header">
      <div class="content-controls">
        <!-- Source order is Tab order, so it follows the screen: filters, search,
             details, left to right at every width. -->
        <div id="filter-buttons-host" class="content-controls-filter-host">
          <FilterButtons
            filterService={services.filterService}
            onFilter={openFilterModal}
          />
        </div>
        <div class="search-input-wrapper">
          <SearchBar filterService={services.filterService} {debouncedSearch} />
        </div>
        <DrawerToggle drawer="details" label="Details" side="right" />
      </div>
    </div>
    <div class="course-container" id="course-container">
      <DegreeFilterBanner filterService={services.filterService} />
      <CourseList
        filterService={services.filterService}
        courseSelectionService={services.courseSelectionService}
        profileStateManager={services.profileStateManager}
      />
    </div>
  </main>

  <SidePanel
    class={styles['right-panel']}
    data-right-panel
    label="Course details and selection"
    drawer={{ id: 'details', title: 'Details' }}
    config={PANEL_WIDTHS.rightPanel}
    edge="left"
    resizeLabel="Resize course details panel"
  >
    <section class={styles['selected-courses-section']}>
      <SelectedCoursesPanel
        courseSelectionService={services.courseSelectionService}
        onPickSections={() => switchToPageView('schedule')}
      />
    </section>
    <section class={styles['course-description-section']}>
      <div
        class={styles['course-description-content']}
        id="course-description"
        bind:this={descriptionEl}
      >
        <CourseDescription courseDataService={services.courseDataService} />
      </div>
    </section>
  </SidePanel>
</div>

<div
  class="app-body schedule-page"
  id="schedule-page"
  style:display={currentPage === 'schedule' ? 'flex' : 'none'}
>
  <div class="schedule-page-layout">
    <!-- The wizard mounts in this sidebar, so dismissing the drawer while it
         is in use cancels it rather than leaving it open out of sight. -->
    <SidePanel
      class="schedule-sidebar"
      label="Schedule courses"
      drawer={{ id: 'schedule', title: 'Courses' }}
      onDrawerClose={() => {
        if (wizardState.isOpen) componentWizardService.closeComponentWizard();
      }}
      config={PANEL_WIDTHS.scheduleSidebar}
      edge="right"
      resizeLabel="Resize schedule sidebar"
    >
      <div class="schedule-sidebar-header">
        <div class="schedule-filter-controls">
          <div
            id="calendar-events-header-slot"
            class="calendar-events-header-slot"
          >
            <CalendarEventsButton
              onClick={() => localEventService.openManager()}
            />
          </div>
          <ScheduleFilterButton
            filterService={services.filterService}
            onFilter={openFilterModal}
          />
        </div>
      </div>
      <div
        class="schedule-sidebar-content"
        id="schedule-sidebar-content"
        class:wizard-active={wizardState.isOpen}
        use:wizardScrollLock={wizardState.isOpen}
      >
        <ScheduleSidebar
          courseSelectionService={services.courseSelectionService}
          getIncompleteInfo={(sc: SelectedCourse) =>
            componentWizardService.getIncompleteSelectionInfo(sc)}
          onOpenWizard={(
            course: Course,
            existing: SelectedCourse | undefined,
          ) => componentWizardService.openComponentWizard(course, existing)}
        />
        <WizardHost />
      </div>
      <div class="schedule-sidebar-content-footer">
        <AutoScheduleControls
          autoScheduleOrchestrator={services.autoScheduleOrchestrator}
          onOpenAutoSchedule={() => autoScheduleService.openAutoSchedule()}
        />
      </div>
    </SidePanel>

    <main
      class="schedule-main"
      tabindex="-1"
      use:icsDropTarget={{
        onActiveChange: active => (icsDropActive = active),
        onFile: file => void localEventService.importFile(file),
      }}
    >
      {#if icsDropActive}
        <div class="ics-drop-overlay" transition:fade={{ duration: dur(150) }}>
          <span>Drop to import calendar events</span>
        </div>
      {/if}
      <ScheduleGrids
        colorService={services.colorService}
        conflictEngine={services.conflictDetector}
        onOpenSectionInfo={(courseId: string, sectionNumber: string) =>
          sectionInfoService.show(courseId, sectionNumber)}
        onOpenEvent={(eventId: string) =>
          localEventService.openEditModal(eventId)}
      />
    </main>
  </div>
</div>

<main
  class="app-body degree-page"
  id="degree-page"
  tabindex="-1"
  style:display={currentPage === 'degree' ? 'flex' : 'none'}
>
  <DegreePage degreeImportService={services.degreeImportService} />
</main>
