import { mount, tick } from 'svelte';
import { TutorialService } from './TutorialService';
import FloatingTextBox from '../../svelte/tutorial/FloatingTextBox.svelte';
import { appState } from '../../core/state/appState.svelte';
import { componentWizardService } from '../../services/scheduling/componentWizardService';
import { autoScheduleService } from '../../services/scheduling/autoScheduleService';
import { normalizeRankingPreferences } from '../../services/scheduling/rankingPreferences';
import { modalState } from '../../svelte/modals/modalState.svelte';
import {
  uiState,
  setPage,
  openModal,
  closeAllModals,
} from '../ui/uiState.svelte';
import type { ServiceContainer } from '../../bootstrap/ServiceContainer';
import { tutorialsAvailable } from '../../svelte/phoneLayout.svelte';
import { STORAGE_KEYS } from '../../utils/storageKeys';
import {
  closeDrawer,
  isDrawerEntry,
  isDrawerOpen,
  openDrawer,
} from '../../svelte/drawerState.svelte';
import { wizardState } from '../../svelte/wizardState.svelte';
import { deepClone } from '../../utils/jsonSerializer';
import { logger } from '../../utils/logger';
import type { ActiveFilter } from '../../types/filters';
import type { PageId } from '../../types/uiState';
import type { Course, SectionsByKind } from '../../types/types';
import type {
  TutorialModal,
  TutorialPicks,
  TutorialState,
} from '../../types/tutorial';
import { TUTORIALS } from './tutorials';
import { courseListState } from '../../svelte/courseListState.svelte';

interface TutorialEntry {
  id: string;
  label: string;
}

/** What a run takes over from the student, handed back when it ends. */
interface HandBack {
  filters: ActiveFilter[];
  page: PageId;
  viewing: Course | null;
}

export interface TutorialSetup {
  service: TutorialService;
  tutorials: TutorialEntry[];
  start: (id: string) => Promise<void>;
  onActiveScheduleChange: () => void;
}

export function setupTutorial(services: ServiceContainer): TutorialSetup {
  const tutorialService = new TutorialService();
  let filteringStarted = false;
  let autoScheduleStarted = false;
  let schedulesStarted = false;
  let previousScheduleId: string | null = null;
  let tutorialScheduleId: string | null = null;
  let cleaningUp = false;
  let starting = false;
  let handBack: HandBack | null = null;

  // Restarting mid-tutorial: stop the running one first, and hold cleaningUp
  // so swapping back to the previous schedule doesn't trigger a second,
  // concurrent teardown via onActiveScheduleChange.
  async function sharedSetup() {
    tutorialService.cancel();
    cleaningUp = true;
    try {
      await cleanupTutorial(false);
      // Before anything else changes, so a failed fetch costs the student nothing.
      await services.courseDataService.addTutorialDepartment(
        services.profileStateManager.getDefaultAcademicYear(),
      );
      // By id: a schedule the student named "Tutorial" is theirs.
      const stale = services.scheduleManagementService
        .getAllSchedules()
        .filter(s => s.id.startsWith('tutorial_'));
      for (const s of stale) {
        await services.scheduleManagementService.deleteSchedule(s.id, {
          force: true,
        });
      }
      previousScheduleId =
        services.scheduleManagementService.getActiveScheduleId();
      handBack = {
        filters: deepClone(services.filterService.getActiveFilters()),
        page: uiState.currentPage,
        viewing: courseListState.selectedCourse,
      };
      const tutorialId = `tutorial_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      const result = await services.scheduleManagementService.createNewSchedule(
        'Tutorial',
        { id: tutorialId },
      );
      tutorialScheduleId = result.schedule?.id ?? null;
    } finally {
      cleaningUp = false;
    }
  }

  async function cleanupTutorial(setVisited: boolean) {
    if (setVisited) {
      localStorage.setItem(STORAGE_KEYS.VISITED, 'true');
    }
    componentWizardService.closeComponentWizard();
    appState.tutorialRanking = null;
    const returning = previousScheduleId !== null;
    if (previousScheduleId) {
      await services.scheduleManagementService.setActiveSchedule(
        previousScheduleId,
      );
      previousScheduleId = null;
    }
    if (tutorialScheduleId) {
      // Deleting refuses the last schedule, and the student can delete their
      // own from the tutorial's Schedules window.
      const schedules = services.scheduleManagementService.getAllSchedules();
      if (schedules.length === 1 && schedules[0].id === tutorialScheduleId) {
        await services.scheduleManagementService.createNewSchedule(
          'My Schedule',
        );
      }
      await services.scheduleManagementService.deleteSchedule(
        tutorialScheduleId,
        { force: true },
      );
      tutorialScheduleId = null;
    }
    services.courseDataService.filterDepartments(d => d.abbreviation !== 'TUT');
    if (handBack) {
      await handBackToStudent(handBack, returning);
      handBack = null;
    }
  }

  async function handBackToStudent(
    taken: HandBack,
    returning: boolean,
  ): Promise<void> {
    setPage(taken.page);
    courseListState.selectedCourse = taken.viewing;
    // Activating a schedule and changing page each rewrite filters from an
    // effect, so those land first.
    await tick();
    // The year goes with the schedule, so it only comes back with theirs.
    const restores = (f: ActiveFilter) => returning || f.id !== 'academicYear';
    for (const f of [...services.filterService.getActiveFilters()]) {
      if (restores(f)) services.filterService.removeFilter(f.id);
    }
    for (const f of taken.filters) {
      if (restores(f)) services.filterService.addFilter(f.id, f.criteria);
    }
    // Every step so far was on a schedule that no longer exists, and undoing
    // into one would bring it back.
    services.profileStateManager.seedUndoBaseline();
  }

  // The cleaningUp guard keeps the schedule swap from re-entering teardown via
  // onActiveScheduleChange.
  function endTutorials(): void {
    cleaningUp = true;
    cleanupTutorial(true)
      .catch((error: unknown) => {
        logger.error('Tutorial cleanup failed:', error);
      })
      .finally(() => {
        cleaningUp = false;
      });
  }

  // Auto-cancel the running tutorial when the active schedule changes away from
  // the tutorial's own schedule. Called by an App.svelte $effect keyed on
  // appState.activeScheduleId. The tutorialScheduleId guard makes this a no-op
  // outside a tutorial.
  function onActiveScheduleChange(): void {
    if (cleaningUp || !tutorialScheduleId) return;
    if (appState.activeScheduleId !== tutorialScheduleId) {
      tutorialService.cancel();
      cleaningUp = true;
      // They picked this schedule, so it's where they stay. Deleting the
      // tutorial's own is no pick: active only fell to the first one left.
      const stillThere = services.scheduleManagementService
        .getAllSchedules()
        .some(s => s.id === tutorialScheduleId);
      if (stillThere) previousScheduleId = null;
      // cleanupTutorial has no internal try/catch and .finally rethrows, so a
      // teardown failure would escape as an unhandled rejection.
      cleanupTutorial(true)
        .catch((error: unknown) => {
          logger.error('Tutorial cleanup failed:', error);
        })
        .finally(() => {
          cleaningUp = false;
        });
    }
  }

  function getTutorialCourse(id: string) {
    return services.courseDataService
      .getAllDepartments()
      .flatMap(d => d.courses)
      .find(c => c.id === id);
  }

  const pickNumbers = (selected: SectionsByKind): TutorialPicks => ({
    lecture: selected.lecture?.number,
    discussion: selected.discussion?.number,
    lab: selected.lab?.number,
  });

  // The sections a set of picks names, as the course's own objects.
  function sectionsFor(course: Course, picks: TutorialPicks): SectionsByKind {
    const group =
      course.lectures?.find(g => g.section.number === picks.lecture) ?? null;
    const discussion =
      picks.discussion && group
        ? (group.compatibleDiscussions.find(
            d => d.number === picks.discussion,
          ) ?? null)
        : null;
    const lab =
      picks.lab && group
        ? (group.compatibleLabs.find(l => l.number === picks.lab) ?? null)
        : null;
    return {
      ...(group?.section && { lecture: group.section }),
      ...(discussion && { discussion }),
      ...(lab && { lab }),
    };
  }

  async function establishCourses(
    state: TutorialState,
    isStale: () => boolean,
  ): Promise<void> {
    const selection = services.courseSelectionService;
    const selected = selection.getSelectedCourses();
    const writes: Array<() => Promise<unknown>> = [];

    for (const sc of selected) {
      if (!(sc.course.id in state.courses)) {
        writes.push(() => selection.unselectCourse(sc.course));
      }
    }
    for (const [id, picks] of Object.entries(state.courses)) {
      const course = getTutorialCourse(id);
      if (!course) continue;
      const current = selected.find(sc => sc.course.id === id);
      // Selecting again would change the course's identity and throw away the
      // schedules generated for it.
      if (!current) writes.push(() => selection.selectCourse(course));
      // Once a schedule is generated, its sections are the state: correcting
      // them back to the start's would undo the generation.
      if (state.generated) continue;
      const has = current ? pickNumbers(current.selected) : {};
      const differs =
        has.lecture !== picks.lecture ||
        has.discussion !== picks.discussion ||
        has.lab !== picks.lab;
      if (differs) {
        writes.push(() =>
          selection.setSelectedComponents(course, sectionsFor(course, picks)),
        );
      }
    }
    if (writes.length === 0) return;

    await services.profileStateManager.withBatch(async () => {
      for (const write of writes) {
        if (isStale()) return;
        await write();
      }
    });
  }

  const canonical = (value: unknown): string =>
    JSON.stringify(value, (_key, v: unknown) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(
            Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
          )
        : v,
    );

  function establishFilters(state: TutorialState): void {
    const filters = services.filterService;
    const wanted = new Map(Object.entries(state.filters));
    // The app drops the department filter on the schedule page, so it is only
    // part of the state where the app keeps it.
    if (state.page === 'planner') {
      wanted.set('department', { departments: ['TUT'] });
    }
    const active = filters.getActiveFilters();
    for (const f of active) {
      // The schedule owns its academic year.
      if (f.id !== 'academicYear' && !wanted.has(f.id)) {
        filters.removeFilter(f.id);
      }
    }
    for (const [id, criteria] of wanted) {
      const current = active.find(f => f.id === id);
      if (id === 'periodConflict') {
        // It also holds the sections it blocks against, which follow the
        // selection and so are not part of what a step says.
        const { selectedCourses: _held, ...held } =
          (current?.criteria as Record<string, unknown> | undefined) ?? {};
        if (current && canonical(held) === canonical(criteria)) continue;
        filters.addFilter(id, {
          ...(criteria as object),
          selectedCourses: services.courseSelectionService.getSelectedCourses(),
        });
      } else if (
        !current ||
        canonical(current.criteria) !== canonical(criteria)
      ) {
        filters.addFilter(id, criteria);
      }
    }
  }

  function establishRanking(state: TutorialState): void {
    const wanted = normalizeRankingPreferences(
      Object.fromEntries(
        Object.entries(state.ranking).map(([key, importance]) => [
          key,
          { importance },
        ]),
      ),
    );
    if (JSON.stringify(appState.tutorialRanking) !== JSON.stringify(wanted)) {
      appState.tutorialRanking = wanted;
    }
  }

  function openTutorialModal(modal: TutorialModal): void {
    switch (modal) {
      case 'filter-modal':
        modalState.filter = { mode: 'filter' };
        openModal('filter-modal');
        break;
      case 'schedule-picker':
        openModal('schedule-picker');
        break;
      case 'auto-schedule-intro':
        autoScheduleService.openAutoScheduleIntro();
        break;
      case 'auto-schedule-filter':
        autoScheduleService.openAutoScheduleFilter();
        break;
    }
  }

  function establishModal(state: TutorialState): void {
    // Drawers are a step's view, set last, so only dialogs count here.
    const open = uiState.openModals.filter(m => !isDrawerEntry(m));
    const matches =
      state.modal === null
        ? open.length === 0
        : open.length === 1 && open[0] === state.modal;
    // A window the student's own click just opened already holds their choices.
    if (matches) return;
    closeAllModals();
    if (state.modal) openTutorialModal(state.modal);
  }

  // Makes the app match `state`, whatever it was before and however the step
  // was reached. Each part writes only where the app differs, so running it
  // again (a layout change, a Find Element) disturbs nothing. The order
  // follows what the app does on its own: a page change drops the department
  // filter and any open drawer, and the wizard seeds itself from the picks.
  tutorialService.onEstablish(async (state, step, isStale) => {
    if (uiState.currentPage !== state.page) {
      setPage(state.page);
      await tick();
      if (isStale()) return;
    }

    await establishCourses(state, isStale);
    if (isStale()) return;

    establishFilters(state);
    establishRanking(state);

    if (courseListState.selectedCourseId !== state.viewing) {
      courseListState.selectedCourse =
        (state.viewing && getTutorialCourse(state.viewing)) || null;
    }

    establishModal(state);

    if (state.wizard) {
      const course = getTutorialCourse(state.wizard.courseId);
      if (course) {
        componentWizardService.openComponentWizard(course, state.wizard.step);
      }
    } else if (wizardState.isOpen) {
      componentWizardService.closeComponentWizard();
    }

    // After the effects the above set off, which each put a drawer away.
    await tick();
    if (isStale()) return;
    if (step.drawer) {
      if (!isDrawerOpen(step.drawer)) openDrawer(step.drawer);
    } else {
      closeDrawer();
    }

    if (
      state.generated &&
      appState.autoScheduleCount === 0 &&
      !appState.scheduleGenerating
    ) {
      autoScheduleService.runAutoSchedule();
    }
  });

  for (const tutorial of TUTORIALS) tutorialService.register(tutorial);
  tutorialService.onComplete(() => {
    if (!filteringStarted) {
      filteringStarted = true;
      tutorialService.start('filtering');
    } else if (!autoScheduleStarted) {
      autoScheduleStarted = true;
      tutorialService.start('autoSchedule');
    } else if (!schedulesStarted) {
      schedulesStarted = true;
      tutorialService.start('schedules');
    } else {
      endTutorials();
    }
  });

  // Skip tutorial: leave the tutorial system entirely, without chaining into
  // whichever tutorial would have come next.
  tutorialService.onExit(() => {
    // A step's own window (Auto-Schedule settings, Schedules) would otherwise
    // stay open over the app the tutorial just stopped setting up.
    closeAllModals();
    endTutorials();
  });

  mount(FloatingTextBox, {
    target: document.body,
    // First in the document, so the box is the first Tab stop while it shows.
    anchor: document.body.firstChild ?? undefined,
    props: { tutorialService },
  });

  const tutorials: TutorialEntry[] = [
    { id: 'welcome', label: 'Getting Started' },
    { id: 'filtering', label: 'Filtering Courses' },
    { id: 'autoSchedule', label: 'Auto Schedule' },
    { id: 'schedules', label: 'Managing Schedules' },
  ];

  async function start(id: string) {
    // The first-visit tutorial can still be loading when the student picks one
    // from the list, and two setups at once would strand one's schedule.
    if (starting || !tutorialsAvailable()) return;
    starting = true;
    try {
      await sharedSetup();
      // The window may have narrowed while the setup ran.
      if (!tutorialsAvailable()) {
        endTutorials();
        return;
      }
      filteringStarted = id !== 'welcome';
      autoScheduleStarted = id === 'autoSchedule' || id === 'schedules';
      schedulesStarted = id === 'schedules';
      tutorialService.start(id);
    } finally {
      starting = false;
    }
  }

  return { service: tutorialService, tutorials, start, onActiveScheduleChange };
}
