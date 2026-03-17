import { TutorialService } from './TutorialService';
import { FloatingTextBox } from '../../ui/components/FloatingTextBox';
import type { ServiceContainer } from '../../bootstrap/ServiceContainer';
import type { MainController } from '../../ui/controllers/MainController';

export interface TutorialEntry {
    id: string;
    label: string;
}

export interface TutorialSetup {
    service: TutorialService;
    tutorials: TutorialEntry[];
    start: (id: string) => Promise<void>;
}

export function setupTutorial(services: ServiceContainer, mainController: MainController): TutorialSetup {
    const tutorialService = new TutorialService();
    let filteringStarted = false;
    let autoScheduleStarted = false;
    let schedulesStarted = false;
    let previousScheduleId: string | null = null;
    let tutorialScheduleId: string | null = null;
    let cleaningUp = false;

    function getTutorialCourse(id: string) {
        return services.courseDataService.getAllDepartments()
            .flatMap(d => d.courses)
            .find(c => c.id === id);
    }

    async function sharedSetup() {
        await cleanupTutorial();
        // Delete any stale Tutorial schedules left over from a previous session
        const stale = services.scheduleManagementService.getAllSchedules()
            .filter(s => s.name === 'Tutorial' || s.name.startsWith('Tutorial ('));
        for (const s of stale) {
            await services.scheduleManagementService.deleteSchedule(s.id, { force: true });
        }
        previousScheduleId = services.scheduleManagementService.getActiveScheduleId();
        services.courseDataService.addTutorialDepartment();
        const result = await services.scheduleManagementService.createNewSchedule('Tutorial');
        tutorialScheduleId = result.schedule?.id ?? null;
    }

    async function cleanupTutorial() {
        mainController.closeWizard();
        services.filterService.clearFilters();
        if (previousScheduleId) {
            await services.scheduleManagementService.setActiveSchedule(previousScheduleId);
            previousScheduleId = null;
        }
        if (tutorialScheduleId) {
            await services.scheduleManagementService.deleteSchedule(tutorialScheduleId, { force: true });
            tutorialScheduleId = null;
        }
        services.courseDataService.filterDepartments(d => d.abbreviation !== 'TUT');
    }

    services.scheduleManagementService.onActiveScheduleChange((activeSchedule) => {
        if (cleaningUp || !tutorialScheduleId) return;
        if (activeSchedule?.id !== tutorialScheduleId) {
            tutorialService.cancel();
            cleaningUp = true;
            cleanupTutorial().finally(() => { cleaningUp = false; });
        }
    });

    tutorialService.register({
        id: 'welcome',
        onStart: () => {
            mainController.closeWizard();
            services.uiStateManager.switchToPage('planner');
        },
        steps: [
            {
                selector: '[data-course-id="TUT-1001"] .course-select-btn',
                title: 'Select a course',
                description: 'Click the + button on the Tutorial course to add it to your planner.',
                waitFor: 'click',
                action: () => {
                    const c = getTutorialCourse('TUT-1001');
                    if (c) services.courseSelectionService.selectCourse(c);
                },
            },
            {
                selector: '#schedule-tab',
                title: 'Go to the Schedule tab',
                description: 'Head to the Schedule tab to start setting up your sections.',
                waitFor: 'click',
                action: () => services.uiStateManager.switchToPage('schedule'),
            },
            {
                selector: '.schedule-course-item[data-course-id="TUT-1001"]',
                title: 'Open section selection',
                description: 'Click the course you just added to open the section picker.',
                waitFor: 'click',
                action: () => {
                    services.uiStateManager.switchToPage('schedule');
                    mainController.openWizardForCourse('TUT-1001');
                },
            },
            {
                selector: '.wizard-section-card',
                title: 'Pick a lecture',
                description: 'Select a lecture section.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('.wizard-section-card')?.click(),
            },
            {
                selector: '.wizard-btn.wizard-btn-primary',
                title: 'Continue to labs',
                description: 'Click Next to move on to selecting a lab.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('.wizard-btn.wizard-btn-primary')?.click(),
            },
            {
                selector: '.wizard-section-card[data-crn="99902"]',
                title: 'Pick a lab',
                description: 'Select a lab section.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('.wizard-section-card[data-crn="99902"]')?.click(),
            },
            {
                selector: '#wizard-next-btn',
                title: 'Finish',
                description: 'Click Finish to confirm your selections and see your course on the schedule.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('#wizard-next-btn')?.click(),
            },
        ],
    });

    function registerFilteringTutorial() {
        const priorYear = services.courseDataService.getLatestAcademicYear()! - 1;
        tutorialService.register({
            id: 'filtering',
            onStart: async () => {
                mainController.closeWizard();
                services.uiStateManager.switchToPage('planner');
                const tut1001 = getTutorialCourse('TUT-1001');
                if (tut1001 && tut1001.lectures) {
                    await services.courseSelectionService.selectCourse(tut1001);
                    const lecture = tut1001.lectures[0].section;
                    const lab = tut1001.lectures[0].compatibleLabs[0] ?? null;
                    await services.courseSelectionService.setSelectedComponents(tut1001, lecture, null, lab);
                }
                const tut1002 = getTutorialCourse('TUT-1002');
                if (tut1002 && tut1002.lectures) {
                    await services.courseSelectionService.selectCourse(tut1002);
                    const lecture = tut1002.lectures[0].section;
                    const lab = tut1002.lectures[0].compatibleLabs[0] ?? null;
                    await services.courseSelectionService.setSelectedComponents(tut1002, lecture, null, lab);
                }
            },
            steps: [
                {
                    selector: '#filter-btn',
                    title: 'Open filters',
                    description: 'Click the filter button to open course filters.',
                    waitFor: 'click',
                    action: () => {
                        services.uiStateManager.switchToPage('planner');
                        document.querySelector<HTMLElement>('#filter-btn')?.click();
                    },
                },
                {
                    selector: 'input.filter-toggle[value="A"][data-filter="term"]',
                    title: 'Filter by term',
                    description: 'Check the A term box to filter courses by term.',
                    waitFor: 'click',
                    action: () => document.querySelector<HTMLElement>('input.filter-toggle[value="A"][data-filter="term"]')?.click(),
                },
                {
                    selector: `.segmented-btn[data-year="${priorYear}"]`,
                    title: 'Change the academic year',
                    description: `Switch to ${priorYear}–${priorYear + 1} to see courses from a prior year.`,
                    waitFor: 'click',
                    action: () => document.querySelector<HTMLElement>(`.segmented-btn[data-year="${priorYear}"]`)?.click(),
                },
                {
                    selector: '.professor-search',
                    title: 'Filter by professor',
                    description: 'Search for "Tutorial" to filter courses by professor.',
                    waitFor: 'click',
                    action: () => {
                        const search = document.querySelector<HTMLInputElement>('.professor-search');
                        if (!search) return;
                        search.value = 'Tutorial';
                        search.dispatchEvent(new Event('input', { bubbles: true }));
                        document.querySelector<HTMLElement>('.professor-option[data-professor="Tutorial"]')?.click();
                    },
                },
                {
                    selector: '#avoid-conflicts-filter',
                    title: 'Avoid schedule conflicts',
                    description: 'Toggle this to hide courses that conflict with your current schedule.',
                    waitFor: 'click',
                    action: () => document.querySelector<HTMLElement>('#avoid-conflicts-filter')?.click(),
                },
                {
                    selector: '#available-only-filter',
                    title: 'Show available courses only',
                    description: 'Toggle this to hide courses with no open seats.',
                    waitFor: 'click',
                    action: () => document.querySelector<HTMLElement>('#available-only-filter')?.click(),
                },
                {
                    selector: '#modal-primary-btn',
                    title: 'Apply filters',
                    description: 'Click Apply to close the filter panel and see your filtered results.',
                    waitFor: 'click',
                    action: () => document.querySelector<HTMLElement>('#modal-primary-btn')?.click(),
                },
                {
                    selector: '[data-course-id="TUT-9001"] .course-select-btn',
                    title: 'Select the prior year course',
                    description: 'Click the + button on the Filtering Example course to add it to your planner.',
                    waitFor: 'click',
                    action: () => {
                        const c = getTutorialCourse('TUT-9001');
                        if (c) services.courseSelectionService.selectCourse(c);
                    },
                },
                {
                    selector: '#schedule-tab',
                    title: 'Go to the Schedule tab',
                    description: 'Head to the Schedule tab to set up your sections.',
                    waitFor: 'click',
                    action: () => services.uiStateManager.switchToPage('schedule'),
                },
                {
                    selector: '.schedule-course-item[data-course-id="TUT-9001"]',
                    title: 'Open section selection',
                    description: 'Click the course to open the section picker.',
                    waitFor: 'click',
                    action: () => {
                        services.uiStateManager.switchToPage('schedule');
                        mainController.openWizardForCourse('TUT-9001');
                    },
                },
                {
                    selector: '.wizard-section-card',
                    title: 'Pick a lecture',
                    description: 'Select a lecture section.',
                    waitFor: 'click',
                    action: () => document.querySelector<HTMLElement>('.wizard-section-card')?.click(),
                },
                {
                    selector: '[data-tutorial-next]',
                    title: 'All done!',
                    description: 'Your prior year course is now on the schedule.',
                    waitFor: 'manual',
                },
            ],
        });
    }

    tutorialService.register({
        id: 'autoSchedule',
        onStart: async () => {
            mainController.closeWizard();
            for (const id of ['TUT-1001', 'TUT-1002', 'TUT-9001']) {
                const c = getTutorialCourse(id);
                if (c) {
                    await services.courseSelectionService.selectCourse(c);
                    await services.courseSelectionService.setSelectedComponents(c, null, null, null);
                }
            }
            services.filterService.clearFilters();
            services.filterService.addFilter('term', { terms: ['A'] });
            services.filterService.addFilter('periodConflict', {
                avoidConflicts: true,
                selectedCourses: services.courseSelectionService.getSelectedCourses(),
            });
            services.filterService.addFilter('availability', { availableOnly: true });
            services.uiStateManager.switchToPage('schedule');
        },
        steps: [
            {
                selector: '#auto-schedule-btn',
                title: 'Auto Schedule',
                description: 'Click Auto Schedule to let the planner automatically find a combination of sections that fit together. It uses your active filters to avoid conflicts and respect your preferences.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('#auto-schedule-btn')?.click(),
            },
            {
                selector: '#modal-primary-btn',
                title: 'Generate schedules',
                description: 'Click Generate to run the scheduler. It will find all valid section combinations based on your filters and show you the results.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('#modal-primary-btn')?.click(),
            },
            {
                selector: '#schedule-next-btn',
                title: 'Browse results',
                description: 'Click the next arrow to cycle through the generated schedules and pick the one that works best for you.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('#schedule-next-btn')?.click(),
            },
        ],
    });

    tutorialService.register({
        id: 'schedules',
        onStart: () => {
            mainController.closeWizard();
            services.uiStateManager.switchToPage('planner');
        },
        steps: [
            {
                selector: '#schedule-picker-btn',
                title: 'Open the schedule manager',
                description: 'Click the Schedules button to open the schedule manager.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('#schedule-picker-btn')?.click(),
            },
            {
                selector: '.nav-tab[data-tab="settings"]',
                title: 'Settings tab',
                description: 'Click the Settings tab to see all options. New Schedule / Import create schedules; Export to Calendar saves your current schedule as an ICS file for Google Calendar or similar; Export All backs up everything as JSON; Toggle Theme switches light/dark mode; Undo/Redo step through changes; What\'s New shows recent updates; Tutorials reopens this menu; Clear All Data wipes everything.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('.nav-tab[data-tab="settings"]')?.click(),
            },
            {
                selector: '#new-schedule-btn-settings',
                title: 'Create a schedule',
                description: 'Click New Schedule, type a name, and you\'re all set. This is the end of the tutorial — you\'ll be taken to your new schedule automatically.',
                waitFor: 'click',
                action: async () => {
                    const result = await services.scheduleManagementService.createNewSchedule('My Schedule');
                    if (result.schedule?.id) {
                        await services.scheduleManagementService.setActiveSchedule(result.schedule.id);
                    }
                },
            },
        ],
    });

    tutorialService.onComplete(() => {
        if (!filteringStarted) {
            filteringStarted = true;
            registerFilteringTutorial();
            tutorialService.start('filtering');
        } else if (!autoScheduleStarted) {
            autoScheduleStarted = true;
            tutorialService.start('autoSchedule');
        } else if (!schedulesStarted) {
            schedulesStarted = true;
            tutorialService.start('schedules');
        } else {
            cleanupTutorial();
        }
    });

    new FloatingTextBox(tutorialService).mount();

    const tutorials: TutorialEntry[] = [
        { id: 'welcome', label: 'Getting Started' },
        { id: 'filtering', label: 'Filtering Courses' },
        { id: 'autoSchedule', label: 'Auto Schedule' },
        { id: 'schedules', label: 'Managing Schedules' },
    ];

    async function start(id: string) {
        await sharedSetup();
        filteringStarted = id !== 'welcome';
        autoScheduleStarted = id === 'autoSchedule' || id === 'schedules';
        schedulesStarted = id === 'schedules';
        if (id === 'filtering') registerFilteringTutorial();
        tutorialService.start(id);
    }

    return { service: tutorialService, tutorials, start };
}
