<script lang="ts">
  import { untrack } from 'svelte';
  import type { PageId } from '../types/uiState';
  import type { Course } from '../types/types';
  import type { SelectedCourse } from '../types/schedule';
  import type { ServiceContainer } from '../bootstrap/ServiceContainer';
  import { uiState, setPage, openModal, showAppError } from '../services/ui/uiState.svelte';
  import { appState } from '../core/state/appState.svelte';
  import { modalState } from './modals/modalState.svelte';
  import { componentWizardService } from '../services/scheduling/componentWizardService';
  import { localEventService } from '../services/scheduling/localEventService';
  import { sectionInfoService } from '../services/scheduling/sectionInfoService';
  import { autoScheduleService } from '../services/scheduling/autoScheduleService';
  import { timestampState } from './timestampState.svelte';
  import { installAppEffects } from './appEffects.svelte';
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
  import DegreePage from './degree/DegreePage.svelte';
  import ResizeHandle from './ResizeHandle.svelte';
  import ErrorBanner from './ErrorBanner.svelte';
  import { PANEL_WIDTHS, applyStoredPanelWidths } from './panelWidths';
  import { logger } from '../utils/logger';

  // Restore any saved sidebar widths before first paint to avoid a layout flash.
  applyStoredPanelWidths();

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

  function toggleTheme(): void {
    const currentThemeId = services.themeManager.getCurrentThemeId();
    services.themeManager.setTheme(currentThemeId === 'wpi-dark' ? 'wpi-light' : 'wpi-dark');
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

  // Global side-effect bridges (activation→year filter, page-nav→filter reset,
  // selection→color/auto-schedule, data-load→service sync, active-schedule→
  // tutorial). Extracted to keep this root as pure composition; runs once here so
  // the effects register in this component's scope.
  installAppEffects(services);
</script>

<svelte:window onkeydown={handleKeydown} />

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
    <nav class="header-navigation" aria-label="Main navigation">
      <div class="nav-tabs-pill">
        <PageTabs onSwitch={switchToPageView} />
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
        <ThemeSelector />
      </div>
    </div>
  </div>
</header>

<div class="app-body" id="planner-page" style:display={currentPage === 'planner' ? 'grid' : 'none'}>
  <aside class="sidebar" aria-label="Department navigation">
    <div class="department-categories" id="department-list">
      <DepartmentSidebar filterService={services.filterService} />
    </div>
    <ResizeHandle config={PANEL_WIDTHS.sidebar} edge="right" label="Resize department sidebar" />
  </aside>

  <main class="main-content">
    <div class="content-header">
      <div class="content-controls">
        <div class="search-input-wrapper">
          <SearchBar filterService={services.filterService} {debouncedSearch} />
        </div>
        <div id="filter-buttons-host" class="content-controls-filter-host">
          <FilterButtons filterService={services.filterService} onFilter={openFilterModal} />
        </div>
        <div id="view-toggle" class="view-toggle">
          <ViewToggle />
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

  <aside class="right-panel" aria-label="Course details and selection">
    <ResizeHandle config={PANEL_WIDTHS.rightPanel} edge="left" label="Resize course details panel" />
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
          <ScheduleFilterButton filterService={services.filterService} onFilter={openFilterModal} />
          <ClearAllSectionsButton courseSelectionService={services.courseSelectionService} />
        </div>
      </div>
      <div class="schedule-sidebar-content" id="schedule-sidebar-content">
        <ScheduleSidebar
          courseSelectionService={services.courseSelectionService}
          getIncompleteInfo={(sc: SelectedCourse) => componentWizardService.getIncompleteSelectionInfo(sc)}
          onOpenWizard={(course: Course, existing: SelectedCourse | undefined) => componentWizardService.openComponentWizard(course, existing)}
        />
        <WizardHost />
      </div>
      <div class="schedule-sidebar-content-footer">
        <AutoScheduleControls
          autoScheduleOrchestrator={services.autoScheduleOrchestrator}
          onOpenAutoSchedule={() => autoScheduleService.openAutoSchedule()}
        />
      </div>
      <ResizeHandle config={PANEL_WIDTHS.scheduleSidebar} edge="right" label="Resize schedule sidebar" />
    </aside>

    <main class="schedule-main">
      <ScheduleGrids
        colorService={services.colorService}
        conflictEngine={services.conflictDetector}
        onOpenSectionInfo={(courseId: string, sectionNumber: string) => sectionInfoService.show(courseId, sectionNumber)}
        onOpenDeleteEvent={(eventId: string) => localEventService.openDeleteModal(eventId)}
      />
    </main>
  </div>
</div>

<div class="app-body degree-page" id="degree-page" style:display={currentPage === 'degree' ? 'block' : 'none'}>
  <DegreePage degreeImportService={services.degreeImportService} />
</div>
