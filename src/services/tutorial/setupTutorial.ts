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
        await cleanupTutorial(false);
        // Delete any stale Tutorial schedules left over from a previous session
        const stale = services.scheduleManagementService.getAllSchedules()
            .filter(s => s.name === 'Tutorial' || s.name.startsWith('Tutorial ('));
        for (const s of stale) {
            await services.scheduleManagementService.deleteSchedule(s.id, { force: true });
        }
        previousScheduleId = services.scheduleManagementService.getActiveScheduleId();
        await services.courseDataService.addTutorialDepartment();
        services.filterService.addFilter('department', { departments: ['TUT'] });
        const tutorialId = `tutorial_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        const result = await services.scheduleManagementService.createNewSchedule('Tutorial', { id: tutorialId });
        tutorialScheduleId = result.schedule?.id ?? null;
    }

    async function cleanupTutorial(setVisited: boolean) {
        if (setVisited) {
            localStorage.setItem('wpi_visited', 'true');
        }
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
            cleanupTutorial(true).finally(() => { cleaningUp = false; });
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
                selector: '[data-course-id="TUT-2001"] .course-select-btn',
                title: 'Select a course',
                description: 'Click the + button on the Tutorial course to add it to your planner.',
                waitFor: 'click',
                scrollArrow: true,
                action: () => {
                    const c = getTutorialCourse('TUT-2001');
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
                selector: '.schedule-course-item[data-course-id="TUT-2001"]',
                title: 'Open section selection',
                description: 'Click the course you just added to open the section picker.',
                waitFor: 'click',
                action: () => {
                    services.uiStateManager.switchToPage('schedule');
                    mainController.openWizardForCourse('TUT-2001');
                },
            },
            {
                selector: '.wizard-section-card[data-crn="100105"]',
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
                selector: '.wizard-section-card[data-crn="100107"]',
                title: 'Pick a lab',
                description: 'Select the bottom lab section. Notice how you can hover the different sections to see how they fit into your schedule.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('.wizard-section-card[data-crn="100107"]')?.click(),
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
        tutorialService.register({
            id: 'filtering',
            onStart: async () => {
                mainController.closeWizard();
                services.uiStateManager.switchToPage('schedule');
                const selections: Array<[string, string, string | null, string | null]> = [
                    ['TUT-2001', 'TAL01', null, 'TAX01'],
                    ['TUT-2002', 'TDL01', null, 'TDX02'],
                    ['TUT-2003', 'TC01', null, null],
                    ['TUT-2004', 'TDL02', 'TDD02', null],
                    ['TUT-2006', 'TAL01', null, 'TAX01'],
                    ['TUT-2007', 'TCL01', null, 'TCX01'],
                    ['TUT-2008', 'TA01 - INQ SEM: Integrating the Humanities in STEM Education', null, null],
                    ['TUT-2009', 'TBL01', null, 'TBX01'],
                    ['TUT-2010', 'TD01', null, null],
                    ['TUT-2011', 'TC01', null, null],
                    ['TUT-2012', 'TBL01', null, 'TBX02'],
                ];
                await services.profileStateManager.withBatch(async () => {
                    for (const [id, lecNum, discNum, labNum] of selections) {
                        const course = getTutorialCourse(id);
                        if (!course?.lectures) continue;
                        const group = course.lectures.find(g => g.section.number === lecNum);
                        if (!group) continue;
                        await services.courseSelectionService.selectCourse(course);
                        const disc = discNum ? group.compatibleDiscussions.find(d => d.number === discNum) ?? null : null;
                        const lab = labNum ? group.compatibleLabs.find(l => l.number === labNum) ?? null : null;
                        await services.courseSelectionService.setSelectedComponents(course, group.section, disc, lab);
                    }
                });
            },
            steps: [
                {
                    selector: '#planner-tab',
                    title: 'Go to the Classes tab',
                    description: 'We only have 2 classes in B term so we need a new course. Lets head to the schedules page to find one that fits.',
                    waitFor: 'click',
                    action: () => services.uiStateManager.switchToPage('planner'),
                },
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
                    selector: 'input.filter-toggle[value="B"][data-filter="term"]',
                    title: 'Filter by term',
                    description: 'Check the B term box to filter for courses/sections that have sections in B term.',
                    waitFor: 'click',
                    scrollArrow: true,
                    action: () => document.querySelector<HTMLElement>('input.filter-toggle[value="B"][data-filter="term"]')?.click(),
                },
                {
                    selector: '#avoid-conflicts-filter',
                    title: 'Avoid schedule conflicts',
                    description: 'Toggle this to hide courses/sections that cannot fit into your current schedule.',
                    waitFor: 'click',
                    scrollArrow: true,
                    action: () => document.querySelector<HTMLElement>('#avoid-conflicts-filter')?.click(),
                },
                {
                    selector: '#available-only-filter',
                    title: 'Show available courses only',
                    description: 'Toggle this to hide courses/sections with no open seats.',
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
                    selector: '[data-course-id="TUT-2005"] .course-select-btn',
                    title: 'Add Blinking LEDs 101',
                    description: 'Click the + button on Blinking LEDs 101 to add it.',
                    waitFor: 'click',
                    scrollArrow: true,
                    action: () => {
                        const c = getTutorialCourse('TUT-2005');
                        if (c) services.courseSelectionService.selectCourse(c);
                    },
                },
                {
                    selector: '#schedule-tab',
                    title: 'Go to the Schedule tab',
                    description: 'Head to the Schedule tab to pick your sections.',
                    waitFor: 'click',
                    action: () => services.uiStateManager.switchToPage('schedule'),
                },
                {
                    selector: '.schedule-course-item[data-course-id="TUT-2005"]',
                    title: 'Open section selection',
                    description: 'Click Blinking LEDs 101 to open the section picker.',
                    waitFor: 'click',
                    action: () => {
                        services.uiStateManager.switchToPage('schedule');
                        mainController.openWizardForCourse('TUT-2005');
                    },
                },
                {
                    selector: '.wizard-section-card[data-crn="100122"]',
                    title: 'Pick a lecture',
                    description: 'Select the B term lecture section.',
                    waitFor: 'click',
                    action: () => document.querySelector<HTMLElement>('.wizard-section-card[data-crn="100122"]')?.click(),
                },
                {
                    selector: '.wizard-btn.wizard-btn-primary',
                    title: 'Continue to labs',
                    description: 'Click Next to move on to selecting a lab.',
                    waitFor: 'click',
                    action: () => document.querySelector<HTMLElement>('.wizard-btn.wizard-btn-primary')?.click(),
                },
                {
                    selector: '.wizard-section-card[data-crn="100124"]',
                    title: 'Pick a lab',
                    description: 'Select the first lab section. Notice how you can hover sections to preview them on the schedule.',
                    waitFor: 'click',
                    action: () => document.querySelector<HTMLElement>('.wizard-section-card[data-crn="100124"]')?.click(),
                },
                {
                    selector: '#wizard-next-btn',
                    title: 'Finish',
                    description: 'Click Finish to confirm your selections.',
                    waitFor: 'click',
                    action: () => document.querySelector<HTMLElement>('#wizard-next-btn')?.click(),
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
            await services.profileStateManager.withBatch(async () => {
                for (const id of ['TUT-2001', 'TUT-2002', 'TUT-2003', 'TUT-2004', 'TUT-2005', 'TUT-2006', 'TUT-2007', 'TUT-2008', 'TUT-2009', 'TUT-2010', 'TUT-2011', 'TUT-2012']) {
                    const c = getTutorialCourse(id);
                    if (c) {
                        await services.courseSelectionService.selectCourse(c);
                        await services.courseSelectionService.setSelectedComponents(c, null, null, null);
                    }
                }
            });
            services.filterService.clearFilters();
            services.uiStateManager.switchToPage('schedule');
        },
        steps: [
            {
                selector: '.schedule-course-item[data-course-id="TUT-2008"]',
                title: 'Lock a section before generating schedules',
                description: 'We are going to lock the TUT2008 course so the auto scheduler does not change it. We can do this just by manually selecting the course.',
                waitFor: 'click',
                scrollArrow: true,
                action: () => {
                    mainController.openWizardForCourse('TUT2008');
                },
            },
            {
                selector: '.wizard-section-card[data-crn="100041"]',
                title: 'Pick a lecture',
                description: 'We are going to use this lecture.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('.wizard-section-card[data-crn="100041')?.click(),
            },
            {
                selector: '#wizard-next-btn',
                title: 'Finish',
                description: 'Click Finish to confirm your selections.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('#wizard-next-btn')?.click(),
            },
            {
                selector: '#auto-schedule-btn',
                title: 'Auto Schedule',
                description: 'Click Auto Schedule to let the planner automatically find a combination of sections that fit together. It uses your active filters to avoid conflicts and respect your preferences.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('#auto-schedule-btn')?.click(),
            },
            {
                selector: '.as-course-card[data-course-id="TUT-2001"] .term-badge[data-term="C"]',
                title: 'Change generation parameters',
                description: 'We are going to make it so TUT2001 and TUT2006 generate only in A term. So we need to unselect the other terms.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('.as-course-card[data-course-id="TUT-2001"] .term-badge[data-term="C"]')?.click(),
            },
            {
                selector: '.as-course-card[data-course-id="TUT-2006"] .term-badge[data-term="C"]',
                title: 'Change generation parameters',
                description: 'Same change for TUT2006.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('.as-course-card[data-course-id="TUT-2006"] .term-badge[data-term="C"]')?.click(),
            },
            {
                selector: '.modal-btn[data-action="next"]',
                title: 'Move onto filters',
                description: 'After your done selecting what courses you want to auto schedule for move onto selecting filters.',
                waitFor: 'click',
                action: () => document.querySelector<HTMLElement>('.modal-btn[data-action="next"]')?.click(),
            },
            {
                    selector: '#available-only-filter',
                    title: 'Filter for only avalable courses',
                    description: 'We only want to generate schedules with courses that are not full so lets filter out the full courses.',
                    waitFor: 'click',
                    scrollArrow: true,
                    action: () => document.querySelector<HTMLElement>('#available-only-filter')?.click(),
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
                title: 'You messed up.',
                description: "Make sure to give the new schedule a name and then hit ok on the prompt.",
                waitFor: 'manual',
                action: async () => {
                    await services.scheduleManagementService.createNewSchedule('Tutorial Done', { autoActivate: true });
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
            cleanupTutorial(true);
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
