<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { PageId } from '../types/uiState';
  import type { Course } from '../types/types';
  import type { SelectedCourse } from '../types/schedule';
  import type { ServiceContainer } from '../bootstrap/ServiceContainer';
  import { uiState } from '../services/ui/uiState.svelte';
  import { appState } from '../core/state/appState.svelte';
  import { modalState } from './modals/modalState.svelte';
  import { componentWizardService } from '../services/scheduling/componentWizardService';
  import { localEventService } from '../services/scheduling/localEventService';
  import { sectionInfoService } from '../services/scheduling/sectionInfoService';
  import { autoScheduleService } from '../services/scheduling/autoScheduleService';
  import { ResizablePanel } from '../ui/components/ResizablePanel';
  import { SwipeGestureHandler } from '../ui/utils/SwipeGestureHandler';
  import { DeviceDetection } from '../utils/deviceDetection';
  import { DebouncedOperation } from '../utils/RequestCancellation';

  import DepartmentSidebar from './DepartmentSidebar.svelte';
  import SearchBar from './SearchBar.svelte';
  import FilterButtons from './FilterButtons.svelte';
  import ViewToggle from './ViewToggle.svelte';
  import CourseList from './CourseList.svelte';
  import SelectedCoursesPanel from './SelectedCoursesPanel.svelte';
  import CourseDescription from './CourseDescription.svelte';
  import PageTabs from './PageTabs.svelte';
  import UndoRedoButtons from './UndoRedoButtons.svelte';
  import ThemeSelector from './ThemeSelector.svelte';
  import SettingsMenu from './SettingsMenu.svelte';
  import CalendarEventsButton from './CalendarEventsButton.svelte';
  import ScheduleFilterButton from './ScheduleFilterButton.svelte';
  import ClearAllSectionsButton from './ClearAllSectionsButton.svelte';
  import ScheduleSidebar from './ScheduleSidebar.svelte';
  import WizardHost from './WizardHost.svelte';
  import AutoScheduleControls from './AutoScheduleControls.svelte';
  import ScheduleGrids from './schedule/ScheduleGrids.svelte';

  // The whole app shell is now declarative. main.ts mounts this once into #app
  // (and ModalLayer separately into #modal-root) instead of MainController's ~16
  // imperative mount() calls. `services` is the same container AppBootstrap built.
  let { services }: { services: ServiceContainer } = $props();

  // `services` is a stable singleton container (built once in main.ts), so this
  // one-time construction reads it non-reactively; untrack makes that explicit.
  const debouncedSearch = untrack(() => new DebouncedOperation(services.operationManager, 'search', 300));

  // Page region display: keep BOTH pages mounted and toggle display off
  // uiState.currentPage (a rune) — replaces UIStateManager.applyPageEffects'
  // imperative #planner-page/#schedule-page style writes. {#if} is avoided so a
  // page's reactive child components are never torn down on a page switch.
  const currentPage = $derived(uiState.currentPage);

  // The schedule-picker button label is declarative now (the old imperative
  // updateSchedulePickerButton is gone).
  const scheduleName = $derived(appState.activeSchedule?.name ?? 'Schedule');

  function handleUndo(): void {
    services.profileStateManager.undo().catch(error => {
      console.error('Undo failed:', error);
      services.uiStateManager.showErrorMessage('Failed to undo. Please try again.');
    });
  }

  function handleRedo(): void {
    services.profileStateManager.redo().catch(error => {
      console.error('Redo failed:', error);
      services.uiStateManager.showErrorMessage('Failed to redo. Please try again.');
    });
  }

  function openFilterModal(): void {
    modalState.filter = { mode: 'filter' };
    services.uiStateManager.modalOpened('filter-modal');
  }

  function openSchedulePicker(): void {
    services.uiStateManager.modalOpened('schedule-picker');
  }

  function switchToPageView(page: PageId): void {
    if (page === 'planner') {
      // Close the wizard when switching back to the classes/planner page.
      componentWizardService.closeComponentWizard();
      services.uiStateManager.setPage('planner');
    } else {
      services.uiStateManager.setPage('schedule');
    }
  }

  function toggleTheme(): void {
    const currentThemeId = services.themeManager.getCurrentThemeId();
    services.themeManager.setTheme(currentThemeId === 'wpi-dark' ? 'wpi-light' : 'wpi-dark');
  }

  function resetSearchAndDepartmentFilters(): void {
    // Both SearchBar and DepartmentSidebar react to these filter removals on
    // their own (SearchBar's $effect clears the input; the sidebar returns to
    // "All Departments").
    services.filterService.removeFilter('searchText');
    services.filterService.removeFilter('department');
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
    } else if (e.ctrlKey && e.key === 'y') {
      e.preventDefault();
      handleRedo();
    }
  }

  function handleSwipeLeft(): void {
    if (services.uiStateManager.getCurrentPage() === 'planner') {
      services.uiStateManager.setPage('schedule');
    }
  }

  function handleSwipeRight(): void {
    if (services.uiStateManager.getCurrentPage() === 'schedule') {
      componentWizardService.closeComponentWizard();
      services.uiStateManager.setPage('planner');
    }
  }

  // Active-schedule (re)activation → sync the academicYear filter to the newly
  // activated schedule's year. Mirrors MainController.setupScheduleChangeListener:
  // the first run is skipped (the initial year filter is set by the
  // loadedDepartments effect below on data load), exclusion-only changes are
  // ignored, and the body runs untracked so its filter writes don't re-trigger
  // the effect.
  let activationInit = false;
  $effect(() => {
    appState.activation; // track activation events only
    untrack(() => {
      if (!activationInit) {
        activationInit = true;
        return;
      }
      if (appState.activation.source === 'calendar-event-exclusion') return;

      const activeSchedule = services.scheduleManagementService.getActiveSchedule();
      if (activeSchedule) {
        if (activeSchedule.year !== undefined) {
          services.filterService.addFilter('academicYear', { year: activeSchedule.year });
        } else {
          const defaultYear = services.profileStateManager.getDefaultAcademicYear();
          if (defaultYear !== undefined) {
            services.filterService.addFilter('academicYear', { year: defaultYear });
          }
        }
      }
    });
  });

  // Page navigation → reset search + department filters on entering the schedule
  // page. Mirrors MainController.setupPageNavigationListener (the prevPage guard;
  // the initial run is a no-op since the start page is 'planner').
  let prevPage: PageId = uiState.currentPage;
  $effect(() => {
    const page = uiState.currentPage;
    untrack(() => {
      if (page === 'schedule' && prevPage !== 'schedule') {
        resetSearchAndDepartmentFilters();
      }
      prevPage = page;
    });
  });

  // Selection change → release colors for deselected courses + invalidate any
  // generated auto-schedules. Replaces CourseColorService.setupColorManagement
  // and AutoScheduleOrchestrator.setupCourseSelectionChangeListener (both were
  // bridge watches on appState.selectedById). The initial run (mount, empty
  // selection) is skipped to match the old watch's skip-initial semantics.
  let selectionInit = false;
  $effect(() => {
    appState.selectedById; // track selection identity changes
    untrack(() => {
      if (!selectionInit) {
        selectionInit = true;
        return;
      }
      services.colorService.releaseUnselectedColors();
      services.autoScheduleOrchestrator.invalidateOnSelectionChange();
    });
  });

  // Course-data load/refresh → sync the non-reactive services off
  // appState.loadedDepartments. Replaces AppBootstrap.setupCourseDataSubscriptions
  // (a bridge watch). CourseDataService reassigns loadedDepartments (a
  // $state.raw freshly-built array) on the initial fetch and every post-sync
  // refresh; one effect covers both. The mount run sees the empty array and is
  // skipped (dataSubsInit) — startApp triggers loadCourseData after mount, so the
  // first real fire is the initial load; initialLoadDone then routes one-time
  // setup vs. the lighter refresh path. Svelte views re-derive from the rune.
  let dataSubsInit = false;
  let initialLoadDone = false;
  $effect(() => {
    appState.loadedDepartments; // track data load/refresh
    untrack(() => {
      if (!dataSubsInit) {
        dataSubsInit = true;
        return;
      }
      const departments = appState.loadedDepartments;
      services.profileStateManager.setCourseData(departments);
      services.courseSelectionService.setAllDepartments(departments);

      if (!initialLoadDone) {
        initialLoadDone = true;
        services.courseSelectionService.reconstructSectionObjects();
        services.timestampManager.updateClientTimestamp();

        // Backfill year for existing schedules that lack one.
        const defaultYear = services.profileStateManager.getDefaultAcademicYear();
        for (const schedule of services.profileStateManager.getAllSchedules()) {
          if (schedule.year === undefined && defaultYear !== undefined) {
            services.profileStateManager.updateSchedule(schedule.id, { year: defaultYear }, 'system');
          }
        }

        // Apply academic year filter based on the active schedule's year.
        if (!services.filterService.hasFilter('academicYear')) {
          const activeSchedule = services.profileStateManager.getActiveSchedule();
          const yearToFilter = activeSchedule?.year ?? defaultYear;
          if (yearToFilter !== undefined) {
            services.filterService.addFilter('academicYear', { year: yearToFilter });
          }
        }
      }
    });
  });

  // Active-schedule change → let the tutorial auto-cancel if the user navigated
  // away from its schedule. Replaces the setupTutorial bridge watch on
  // appState.activeScheduleId. services.tutorial is assigned in main.ts after
  // mount, so it may be undefined on the initial run (guarded by ?.); the
  // tutorialScheduleId guard inside makes it a no-op outside a tutorial.
  $effect(() => {
    appState.activeScheduleId; // track active-schedule changes
    untrack(() => {
      services.tutorial?.onActiveScheduleChange();
    });
  });

  onMount(() => {
    // Resizable panels (left sidebar / right panel / schedule sidebar). Same
    // selectors + bounds MainController.setupResizablePanels used.
    new ResizablePanel({
      panels: [
        { handleSelector: '.resize-handle-left', targetProperty: '--panel-sidebar-width', minWidth: 200, maxWidth: 400, defaultWidth: 280, direction: 'left' },
        { handleSelector: '.resize-handle-right', targetProperty: '--panel-right-width', minWidth: 250, maxWidth: 1000, defaultWidth: 700, direction: 'right' },
        { handleSelector: '.resize-handle-schedule', targetProperty: '--panel-schedule-sidebar-width', minWidth: 200, maxWidth: 500, defaultWidth: 400, direction: 'left' },
      ]
    });

    // Mobile swipe navigation between the two pages.
    if (DeviceDetection.isMobilePhone()) {
      const plannerPage = document.getElementById('planner-page');
      const schedulePage = document.getElementById('schedule-page');
      if (plannerPage) new SwipeGestureHandler(plannerPage, handleSwipeLeft, handleSwipeRight);
      if (schedulePage) new SwipeGestureHandler(schedulePage, handleSwipeLeft, handleSwipeRight);
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<header class="app-header">
  <div class="header-content">
    <div class="header-left">
      <h1>WPI Course Planner</h1>
      <div class="header-subtitle">
        <div class="timestamps-container">
          <span id="client-timestamp">Loading client data...</span>
          <span id="server-timestamp">Loading server data...</span>
        </div>
      </div>
    </div>
    <nav class="header-navigation" aria-label="Main navigation">
      <div class="nav-tabs-pill">
        <PageTabs uiStateManager={services.uiStateManager} onSwitch={switchToPageView} />
      </div>
    </nav>
    <div class="header-controls">
      <SettingsMenu
        onSchedules={openSchedulePicker}
        onToggleTheme={toggleTheme}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
      <div class="undo-redo-controls">
        <UndoRedoButtons onUndo={handleUndo} onRedo={handleRedo} />
      </div>
      <button id="schedule-picker-btn" class="btn btn-icon" title="Select Schedule" onclick={openSchedulePicker}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span id="schedule-picker-label">{scheduleName}</span>
      </button>
      <div class="theme-selector">
        <ThemeSelector profileStateManager={services.profileStateManager} />
      </div>
    </div>
  </div>
</header>

<div class="app-body" id="planner-page" style:display={currentPage === 'planner' ? 'grid' : 'none'}>
  <aside class="sidebar" aria-label="Department navigation">
    <div class="department-categories" id="department-list">
      <DepartmentSidebar filterService={services.filterService} />
    </div>
  </aside>

  <div class="resize-handle resize-handle-left" data-resize="sidebar" role="separator" aria-orientation="vertical" aria-label="Resize left sidebar"></div>

  <main class="main-content">
    <div class="content-header">
      <div class="content-controls">
        <div class="search-input-wrapper">
          <SearchBar filterService={services.filterService} {debouncedSearch} onModalSync={() => {}} />
        </div>
        <div id="filter-buttons-host" class="content-controls-filter-host">
          <FilterButtons filterService={services.filterService} onFilter={openFilterModal} />
        </div>
        <div id="view-toggle" class="view-toggle">
          <ViewToggle uiStateManager={services.uiStateManager} />
        </div>
      </div>
    </div>
    <div class="course-container" id="course-container">
      <CourseList
        filterService={services.filterService}
        courseSelectionService={services.courseSelectionService}
        profileStateManager={services.profileStateManager}
      />
    </div>
  </main>

  <div class="resize-handle resize-handle-right" data-resize="right-panel" role="separator" aria-orientation="vertical" aria-label="Resize right panel"></div>

  <aside class="right-panel" aria-label="Course details and selection">
    <section class="selected-courses-section">
      <SelectedCoursesPanel courseSelectionService={services.courseSelectionService} />
    </section>
    <section class="course-description-section">
      <div class="course-description-content" id="course-description">
        <CourseDescription courseDataService={services.courseDataService} />
      </div>
    </section>
  </aside>
</div>

<div class="app-body schedule-page" id="schedule-page" style:display={currentPage === 'schedule' ? 'flex' : 'none'}>
  <div class="schedule-page-layout">
    <aside class="schedule-sidebar">
      <div class="schedule-sidebar-header">
        <div class="schedule-filter-controls">
          <div id="calendar-events-header-slot" class="calendar-events-header-slot">
            <CalendarEventsButton onClick={() => localEventService.openAddModal()} />
          </div>
          <div id="schedule-filter-slot" style="display: contents">
            <ScheduleFilterButton filterService={services.filterService} onFilter={openFilterModal} />
          </div>
          <div id="clear-all-sections-slot" style="display: contents">
            <ClearAllSectionsButton courseSelectionService={services.courseSelectionService} />
          </div>
        </div>
      </div>
      <div class="schedule-sidebar-content" id="schedule-sidebar-content">
        <div id="schedule-sidebar-courses" style="display: contents">
          <ScheduleSidebar
            courseSelectionService={services.courseSelectionService}
            getIncompleteInfo={(sc: SelectedCourse) => componentWizardService.getIncompleteSelectionInfo(sc)}
            onOpenWizard={(course: Course, existing: SelectedCourse | undefined) => componentWizardService.openComponentWizard(course, existing)}
          />
        </div>
        <WizardHost />
      </div>
      <div class="schedule-sidebar-content-footer">
        <AutoScheduleControls
          autoScheduleOrchestrator={services.autoScheduleOrchestrator}
          onOpenAutoSchedule={() => autoScheduleService.openAutoSchedule()}
        />
      </div>
    </aside>

    <div class="resize-handle resize-handle-schedule" data-resize="schedule-sidebar" role="separator" aria-orientation="vertical" aria-label="Resize schedule sidebar"></div>

    <main class="schedule-main">
      <div id="schedule-grids-root" style="display: contents">
        <ScheduleGrids
          colorService={services.colorService}
          conflictEngine={services.conflictDetector}
          onOpenSectionInfo={(courseId: string, sectionNumber: string) => sectionInfoService.show(courseId, sectionNumber)}
          onOpenDeleteEvent={(eventId: string) => localEventService.openDeleteModal(eventId)}
        />
      </div>
    </main>
  </div>
</div>
