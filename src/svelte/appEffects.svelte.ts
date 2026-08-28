import { untrack } from 'svelte';
import type { PageId } from '../types/uiState';
import type { ServiceContainer } from '../bootstrap/ServiceContainer';
import { uiState } from '../services/ui/uiState.svelte';
import { appState } from '../core/state/appState.svelte';
import { updateClientTimestamp } from './timestampState.svelte';

/**
 * Installs the app's global side-effect bridges. Call once during App.svelte
 * initialization (so the `$effect`s register in its component scope).
 *
 * Each effect tracks exactly one rune, then runs its body `untrack`ed so the
 * services it writes can't re-trigger it, and skips its initial (mount) fire.
 * Keeping these out of the layout root leaves App.svelte as pure composition.
 */
export function installAppEffects(services: ServiceContainer): void {
  // Active-schedule (re)activation -> sync the academicYear filter to the newly
  // activated schedule's year. The first run is skipped (the initial year filter
  // is set by the loadedDepartments effect on data load), exclusion-only changes
  // are ignored, and the body runs untracked so its filter writes don't re-fire.
  let activationInit = false;
  $effect(() => {
    appState.activation; // track activation events only
    untrack(() => {
      if (!activationInit) {
        activationInit = true;
        return;
      }
      if (appState.activation.source === 'calendar-event-exclusion') return;

      const activeSchedule =
        services.scheduleManagementService.getActiveSchedule();
      if (activeSchedule) {
        if (activeSchedule.year !== undefined) {
          services.filterService.addFilter('academicYear', {
            year: activeSchedule.year,
          });
        } else {
          const defaultYear =
            services.profileStateManager.getDefaultAcademicYear();
          if (defaultYear !== undefined) {
            services.filterService.addFilter('academicYear', {
              year: defaultYear,
            });
          }
        }
      }
    });
  });

  // Page navigation -> reset search + department filters on entering the schedule
  // page (the initial run is a no-op since the start page is 'planner'). Both
  // SearchBar and DepartmentSidebar react to these removals on their own.
  let prevPage: PageId = uiState.currentPage;
  $effect(() => {
    const page = uiState.currentPage;
    untrack(() => {
      if (page === 'schedule' && prevPage !== 'schedule') {
        services.filterService.removeFilter('searchText');
        services.filterService.removeFilter('department');
      }
      prevPage = page;
    });
  });

  // Selection change -> release colors for deselected courses + invalidate any
  // generated auto-schedules. The initial run (mount, empty selection) is skipped.
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

  // Course-data load/refresh -> sync the non-reactive services off
  // appState.loadedDepartments. CourseDataService reassigns loadedDepartments
  // (a $state.raw freshly-built array) on the initial fetch and every post-sync
  // refresh; one effect covers both. The mount run sees the empty array and is
  // skipped (dataSubsInit) - startApp triggers loadCourseData after mount, so the
  // first real fire is the initial load; initialLoadDone then routes one-time
  // setup vs. the lighter refresh path.
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

      if (!initialLoadDone) {
        initialLoadDone = true;
        services.courseSelectionService.reconstructSectionObjects();
        updateClientTimestamp();

        // Backfill year for existing schedules that lack one.
        const defaultYear =
          services.profileStateManager.getDefaultAcademicYear();
        for (const schedule of services.profileStateManager.getAllSchedules()) {
          if (schedule.year === undefined && defaultYear !== undefined) {
            services.profileStateManager.updateSchedule(
              schedule.id,
              { year: defaultYear },
              'system',
            );
          }
        }

        // Apply academic year filter based on the active schedule's year.
        if (!services.filterService.hasFilter('academicYear')) {
          const activeSchedule =
            services.profileStateManager.getActiveSchedule();
          const yearToFilter = activeSchedule?.year ?? defaultYear;
          if (yearToFilter !== undefined) {
            services.filterService.addFilter('academicYear', {
              year: yearToFilter,
            });
          }
        }
      }
    });
  });

  // Active-schedule change -> let the tutorial auto-cancel if the user navigated
  // away from its schedule. services.tutorial is assigned in main.ts after mount,
  // so it may be undefined on the initial run (guarded by ?.).
  $effect(() => {
    appState.activeScheduleId; // track active-schedule changes
    untrack(() => {
      services.tutorial?.onActiveScheduleChange();
    });
  });
}
