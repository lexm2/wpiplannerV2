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
                selector: '[data-tutorial-next]',
                title: 'WPI Planner Tutorials',
                description: "Welcome to the WPI planner, I have set up 4 quick tutorials to bring you through most of the important aspects of the planner. Hit next when you're ready to start.",
                waitFor: 'manual',
            },
            {
                selector: '[data-course-id="TUT-1001"] .course-select-btn',
                title: 'Select a course',
                description: 'Click the + button on the Tutorial course to add it to your planner.',
                waitFor: 'click',
                scrollArrow: true,
                action: () => {
                    const c = getTutorialCourse('TUT-1001');
                    if (c) services.courseSelectionService.selectCourse(c);
                },
            },
            {
                selector: '#schedule-tab',
                title: 'Go to the Schedule tab',
                description: 'Head to the Schedule tab, this is where you will select your sections and see your schedule.',
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
                description: 'Select the only lecture section.',
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
                description: 'Select the top lab section. Notice how you can hover the different sections to see how they fit into your schedule.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('.wizard-section-card[data-crn="99902"]')?.click(),
            },
            {
                selector: '#wizard-next-btn',
                title: 'Finish',
                description: 'Click Finish to confirm your selections, if you hit cancel the selections will be lost.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('#wizard-next-btn')?.click(),
            },
            {
                selector: '[data-tutorial-next]',
                title: 'Next Tutorial: Filtering',
                description: 'You now know the basic functionality of the planner. The next tutorial will go over how to quickly find courses that work for you. If you want to skip over a tutorial for any reason just hit skip tutorial and it will move onto the next one. If you want to restart a tutorial, go to the schedules button at the top right then settings then click on tutorials.',
                waitFor: 'manual',
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
                    scrollArrow: true,
                    action: () => document.querySelector<HTMLElement>('input.filter-toggle[value="A"][data-filter="term"]')?.click(),
                },
                {
                    selector: `.segmented-btn[data-year="${priorYear}"]`,
                    title: 'Change the academic year',
                    description: 'Normally your schedule could never have courses from multiple years but this is just for demonstration purposes.',
                    waitFor: 'click',
                    scrollArrow: true,
                    action: () => document.querySelector<HTMLElement>(`.segmented-btn[data-year="${priorYear}"]`)?.click(),
                },
                {
                    selector: '.professor-search',
                    title: 'Filter by professor',
                    description: 'Search for "Tutorial" to filter courses by professor. As you type you should see search suggestions show up.',
                    waitFor: 'appear',
                    scrollArrow: true,
                    waitForSelector: '.filter-chip-remove[data-professor="Tutorial"]',
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
                    description: 'Toggle this to hide courses that cannot fit into your current schedule.',
                    waitFor: 'click',
                    scrollArrow: true,
                    action: () => document.querySelector<HTMLElement>('#avoid-conflicts-filter')?.click(),
                },
                {
                    selector: '#available-only-filter',
                    title: 'Show available courses only',
                    description: 'Toggle this to hide courses with no open seats.',
                    waitFor: 'click',
                    scrollArrow: true,
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
                    title: 'Next Tutorial: Auto Scheduling',
                    description: "The next tutorial will go over how to use the auto scheduler to automatically select your course sections.",
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
                description: 'The filters have already been set up for you. Click Generate to run the scheduler. It will find all valid section combinations based on your filters and show you the results.',
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
            {
                selector: '[data-tutorial-next]',
                title: 'Next Tutorial: schedule manager',
                description: "The next tutorial goes over how to create a new schedule and some of the settings available.",
                waitFor: 'manual',
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
                description: 'Click the Settings tab to see all options.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('.nav-tab[data-tab="settings"]')?.click(),
            },
            {
                selector: '[data-tutorial-next]',
                title: 'Export ICS',
                description: "The Export ICS button will export this schedule to a format that you can drag into your calendar to import.",
                waitFor: 'manual',
            },
            {
                selector: '[data-tutorial-next]',
                title: 'Export/Import',
                description: "This will export the course to a JSON file which then can be imported on another device. Note that if you import into an existing schedule it will add all the courses from the exported schedule onto that schedule.",
                waitFor: 'manual',
            },
            {
                selector: '#new-schedule-btn-settings',
                title: 'All done',
                description: "Click New Schedule, type a name, and you're all set. The tutorial will end, and you'll be taken to your new schedule automatically. The modal will not automatically close.",
                waitFor: 'click',
                action: async () => {
                    const result = await services.scheduleManagementService.createNewSchedule('My Schedule');
                    if (result.schedule?.id) {
                        await services.scheduleManagementService.setActiveSchedule(result.schedule.id);
                    }
                },
            },
            {
                selector: '[data-tutorial-next]',
                title: 'Uh oh',
                description: "You should not be able to see this, if you can then make a issue on github and explain how you made it appear.",
                waitFor: 'manual',
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
