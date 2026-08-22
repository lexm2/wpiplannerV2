import { mount } from 'svelte';
import { TutorialService } from './TutorialService';
import { TutorialStateMachine } from './TutorialStateMachine';
import FloatingTextBox from '../../svelte/tutorial/FloatingTextBox.svelte';
import { appState } from '../../core/state/appState.svelte';
import { componentWizardService } from '../../services/scheduling/componentWizardService';
import { autoScheduleService } from '../../services/scheduling/autoScheduleService';
import { modalState } from '../../svelte/modals/modalState.svelte';
import { uiState, setPage, openModal, closeAllModals } from '../ui/uiState.svelte';
import type { ServiceContainer } from '../../bootstrap/ServiceContainer';
import { STORAGE_KEYS } from '../../utils/storageKeys'

export interface TutorialEntry {
    id: string;
    label: string;
}

export interface TutorialSetup {
    service: TutorialService;
    tutorials: TutorialEntry[];
    start: (id: string) => Promise<void>;
    onActiveScheduleChange: () => void;
}

export function setupTutorial(services: ServiceContainer): TutorialSetup {
    const tutorialService = new TutorialService();
    const stateMachine = new TutorialStateMachine(services);
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

    async function selectTutorialCourse(cs: { courseId: string; lecture?: string; discussion?: string; lab?: string }): Promise<void> {
        const course = getTutorialCourse(cs.courseId);
        if (!course) return;
        await services.courseSelectionService.selectCourse(course);
        if (cs.lecture || cs.discussion || cs.lab) {
            const group = course.lectures?.find(g => g.section.number === cs.lecture) ?? null;
            const disc = cs.discussion && group
                ? group.compatibleDiscussions.find(d => d.number === cs.discussion) ?? null
                : null;
            const lab = cs.lab && group
                ? group.compatibleLabs.find(l => l.number === cs.lab) ?? null
                : null;
            await services.courseSelectionService.setSelectedComponents(course, {
                ...(group?.section && { lecture: group.section }),
                ...(disc && { discussion: disc }),
                ...(lab && { lab }),
            });
        }
    }

    async function sharedSetup() {
        await cleanupTutorial(false);
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
        stateMachine.clear();
        if (setVisited) {
            localStorage.setItem(STORAGE_KEYS.VISITED, 'true');
        }
        componentWizardService.closeComponentWizard();
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

    // Auto-cancel the running tutorial when the active schedule changes away from
    // the tutorial's own schedule. Called by an App.svelte $effect keyed on
    // appState.activeScheduleId. The tutorialScheduleId guard makes this a no-op
    // outside a tutorial.
    function onActiveScheduleChange(): void {
        if (cleaningUp || !tutorialScheduleId) return;
        if (appState.activeScheduleId !== tutorialScheduleId) {
            tutorialService.cancel();
            cleaningUp = true;
            cleanupTutorial(true).finally(() => { cleaningUp = false; });
        }
    }

    tutorialService.register({
        id: 'welcome',
        onStart: () => {
            componentWizardService.closeComponentWizard();
            setPage('planner');
        },
        steps: [
            {
                selector: '[data-tutorial-find]',
                title: 'WPI Planner Tutorials',
                description: 'Welcome to the WPI planner! Each step will highlight an element like <span class="tutorial-inline-highlight">this</span>. Try clicking the Find Element button to see where the highlighted element is.',
                waitFor: 'click',
                uiState: { currentPage: 'planner' },
            },
            {
                selector: '[data-course-id="TUT-2001"] .course-select-btn',
                title: 'Select a course',
                description: 'Click the + button on the Tutorial course to add it to your planner.',
                waitFor: 'click',
                scrollArrow: true,
                stopPropagation: true,
                uiState: { currentPage: 'planner' },
            },
            {
                selector: '#schedule-tab',
                title: 'Go to the Schedule tab',
                description: 'Head to the Schedule tab, this is where you will select your sections and see your schedule.',
                waitFor: 'click',
                uiState: { currentPage: 'planner' },
                appState: { selectedCourses: [{ courseId: 'TUT-2001' }] },
            },
            {
                selector: '.schedule-course-item[data-course-id="TUT-2001"]',
                title: 'Open section selection',
                description: 'Click the course you just added to open the section picker.',
                waitFor: 'click',
                uiState: { currentPage: 'schedule' },
                appState: { selectedCourses: [{ courseId: 'TUT-2001' }] },
            },
            {
                selector: '[data-crn="100108"]',
                title: 'Pick a lecture',
                description: 'Select the second lecture section.',
                waitFor: 'click',
                // The wizard toggles a section off when it is clicked while already
                // selected, and the next step's appState selects this very section.
                // Whichever lands first, letting both run cancels the pick — so the
                // tutorial's declarative state is the only thing that selects here.
                stopPropagation: true,
                uiState: { currentPage: 'schedule', wizard: { isOpen: true, courseId: 'TUT-2001', step: 'lecture' } },
                appState: { selectedCourses: [{ courseId: 'TUT-2001' }] },
            },
            {
                selector: '#wizard-next-btn',
                title: 'Continue to labs',
                description: 'Click Next to move on to selecting a lab.',
                waitFor: 'click',
                // The next step moves the wizard to its lab step, which flips this
                // button from Next to Finish. If the app's own handler runs after
                // that, the click completes and closes the wizard instead.
                stopPropagation: true,
                uiState: { currentPage: 'schedule', wizard: { isOpen: true, courseId: 'TUT-2001', step: 'lecture' } },
                appState: { selectedCourses: [{ courseId: 'TUT-2001', lecture: 'TCL01' }] },
            },
            {
                selector: '[data-crn="100111"]',
                title: 'Pick a lab',
                description: 'Select the bottom lab section. Notice how you can hover the different sections to see how they fit into your schedule.',
                waitFor: 'click',
                stopPropagation: true,
                uiState: { currentPage: 'schedule', wizard: { isOpen: true, courseId: 'TUT-2001', step: 'lab' } },
                appState: { selectedCourses: [{ courseId: 'TUT-2001', lecture: 'TCL01' }] },
            },
            {
                selector: '#wizard-next-btn',
                title: 'Finish',
                description: 'Click Finish to confirm your selections, if you hit cancel the selections will be lost.',
                waitFor: 'click',
                uiState: { currentPage: 'schedule', wizard: { isOpen: true, courseId: 'TUT-2001', step: 'lab' } },
                appState: { selectedCourses: [{ courseId: 'TUT-2001', lecture: 'TCL01', lab: 'TCX03' }] },
            },
            {
                selector: '[data-tutorial-next]',
                title: 'Next Tutorial: Filtering',
                description: 'You now know the basic functionality of the planner. The next tutorial will go over how to quickly find courses that work for you. If you want to skip over a tutorial for any reason just hit skip tutorial and it will move onto the next one. If you want to restart a tutorial, go to the schedules button at the top right then settings then click on tutorials.',
                waitFor: 'manual',
                uiState: { currentPage: 'schedule', wizard: { isOpen: false, courseId: null, step: null } },
                appState: { selectedCourses: [{ courseId: 'TUT-2001', lecture: 'TCL01', lab: 'TCX03' }] },
            },
        ],
    });

    function registerFilteringTutorial() {
        tutorialService.register({
            id: 'filtering',
            onStart: async () => {
                componentWizardService.closeComponentWizard();
                setPage('schedule');
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
                        await services.courseSelectionService.setSelectedComponents(course, {
                            lecture: group.section,
                            ...(disc && { discussion: disc }),
                            ...(lab && { lab }),
                        });
                    }
                });
            },
            steps: [
                {
                    selector: '#planner-tab',
                    title: 'Go to the Classes tab',
                    description: 'We only have 2 classes in B term so we need a new course. Let\'s head to the Classes tab to find one that fits.',
                    waitFor: 'click',
                    uiState: { currentPage: 'schedule' },
                },
                {
                    selector: '#filter-btn',
                    title: 'Open filters',
                    description: 'Click the filter button to open course filters.',
                    waitFor: 'click',
                    uiState: { currentPage: 'planner' },
                },
                {
                    selector: 'input.filter-toggle[value="B"][data-filter="term"]',
                    title: 'Filter by term',
                    description: 'Check the B term box to filter for courses/sections that have sections in B term.',
                    waitFor: 'click',
                    scrollArrow: true,
                    uiState: { currentPage: 'planner', openModals: ['filter-modal'] },
                },
                {
                    selector: '#avoid-conflicts-filter',
                    title: 'Avoid schedule conflicts',
                    description: 'Toggle this to hide courses/sections that cannot fit into your current schedule.',
                    waitFor: 'click',
                    scrollArrow: true,
                    uiState: { currentPage: 'planner', openModals: ['filter-modal'] },
                    appState: { filters: [{ id: 'term', criteria: { terms: ['B'] } }], refreshFilterUI: true },
                },
                {
                    selector: '#available-only-filter',
                    title: 'Show available courses only',
                    description: 'Toggle this to hide courses/sections with no open seats.',
                    waitFor: 'click',
                    scrollArrow: true,
                    uiState: { currentPage: 'planner', openModals: ['filter-modal'] },
                    appState: { filters: [
                        { id: 'term', criteria: { terms: ['B'] } },
                        { id: 'periodConflict', criteria: { avoidConflicts: true, blockedSlots: [] } },
                    ], refreshFilterUI: true },
                },
                {
                    selector: '#modal-primary-btn',
                    title: 'Apply filters',
                    description: 'Click Apply to close the filter panel and see your filtered results.',
                    waitFor: 'click',
                    uiState: { currentPage: 'planner', openModals: ['filter-modal'] },
                    appState: { filters: [
                        { id: 'term', criteria: { terms: ['B'] } },
                        { id: 'periodConflict', criteria: { avoidConflicts: true, blockedSlots: [] } },
                        { id: 'availability', criteria: { availableOnly: true } },
                    ], refreshFilterUI: true },
                },
                {
                    selector: '[data-course-id="TUT-2005"] .course-select-btn',
                    title: 'Add Blinking LEDs 101',
                    description: 'Click the + button on Blinking LEDs 101 to add it.',
                    waitFor: 'click',
                    scrollArrow: true,
                    stopPropagation: true,
                    uiState: { currentPage: 'planner' },
                    appState: { filters: [
                        { id: 'term', criteria: { terms: ['B'] } },
                        { id: 'periodConflict', criteria: { avoidConflicts: true, blockedSlots: [] } },
                        { id: 'availability', criteria: { availableOnly: true } },
                    ], refreshFilterUI: true },
                },
                {
                    selector: '#schedule-tab',
                    title: 'Go to the Schedule tab',
                    description: 'Head to the Schedule tab to pick your sections.',
                    waitFor: 'click',
                    uiState: { currentPage: 'planner' },
                    appState: { selectedCourses: [{ courseId: 'TUT-2005' }] },
                },
                {
                    selector: '.schedule-course-item[data-course-id="TUT-2005"]',
                    title: 'Open section selection',
                    description: 'Click Blinking LEDs 101 to open the section picker.',
                    waitFor: 'click',
                    uiState: { currentPage: 'schedule' },
                    appState: { selectedCourses: [{ courseId: 'TUT-2005' }] },
                },
                {
                    selector: '[data-crn="100122"]',
                    title: 'Pick a lecture',
                    description: 'Select the B term lecture section.',
                    waitFor: 'click',
                    stopPropagation: true,
                    uiState: { currentPage: 'schedule', wizard: { isOpen: true, courseId: 'TUT-2005', step: 'lecture' } },
                    appState: { selectedCourses: [{ courseId: 'TUT-2005' }] },
                },
                {
                    selector: '#wizard-next-btn',
                    title: 'Continue to labs',
                    description: 'Click Next to move on to selecting a lab.',
                    waitFor: 'click',
                    stopPropagation: true,
                    uiState: { currentPage: 'schedule', wizard: { isOpen: true, courseId: 'TUT-2005', step: 'lecture' } },
                    appState: { selectedCourses: [{ courseId: 'TUT-2005', lecture: 'TBL01' }] },
                },
                {
                    selector: '[data-crn="100124"]',
                    title: 'Pick a lab',
                    description: 'Select the first lab section. Notice how you can hover sections to preview them on the schedule.',
                    waitFor: 'click',
                    stopPropagation: true,
                    uiState: { currentPage: 'schedule', wizard: { isOpen: true, courseId: 'TUT-2005', step: 'lab' } },
                    appState: { selectedCourses: [{ courseId: 'TUT-2005', lecture: 'TBL01' }] },
                },
                {
                    selector: '#wizard-next-btn',
                    title: 'Finish',
                    description: 'Click Finish to confirm your selections.',
                    waitFor: 'click',
                    uiState: { currentPage: 'schedule', wizard: { isOpen: true, courseId: 'TUT-2005', step: 'lab' } },
                    appState: { selectedCourses: [{ courseId: 'TUT-2005', lecture: 'TBL01', lab: 'TBX02' }] },
                },
                {
                    selector: '[data-tutorial-next]',
                    title: 'Next Tutorial: Auto Scheduling',
                    description: "The next tutorial will go over how to use the auto scheduler to automatically select your course sections.",
                    waitFor: 'manual',
                    uiState: { currentPage: 'schedule', wizard: { isOpen: false, courseId: null, step: null } },
                    appState: { selectedCourses: [{ courseId: 'TUT-2005', lecture: 'TBL01', lab: 'TBX02' }] },
                },
            ],
        });
    }

    tutorialService.register({
        id: 'autoSchedule',
        onStart: async () => {
            componentWizardService.closeComponentWizard();
            await services.profileStateManager.withBatch(async () => {
                for (const id of ['TUT-2001', 'TUT-2002', 'TUT-2003', 'TUT-2004', 'TUT-2005', 'TUT-2006', 'TUT-2007', 'TUT-2008', 'TUT-2009', 'TUT-2010', 'TUT-2011', 'TUT-2012']) {
                    const c = getTutorialCourse(id);
                    if (c) {
                        await services.courseSelectionService.selectCourse(c);
                        await services.courseSelectionService.setSelectedComponents(c, {});
                    }
                }
            });
            services.filterService.clearFilters();
            setPage('schedule');
        },
        steps: [
            {
                selector: '.schedule-course-item[data-course-id="TUT-2008"]',
                title: 'Lock a section before generating schedules',
                description: 'We are going to lock the TUT2008 course so the auto scheduler does not change it. We can do this just by manually selecting the course.',
                waitFor: 'click',
                scrollArrow: true,
                uiState: { currentPage: 'schedule' },
            },
            {
                selector: '[data-crn="100041"]',
                title: 'Pick a lecture',
                description: 'We are going to use this lecture.',
                waitFor: 'click',
                stopPropagation: true,
                uiState: { currentPage: 'schedule', wizard: { isOpen: true, courseId: 'TUT-2008', step: 'lecture' } },
                appState: { selectedCourses: [{ courseId: 'TUT-2008' }] },
            },
            {
                selector: '#wizard-next-btn',
                title: 'Finish',
                description: 'Click Finish to confirm your selections.',
                waitFor: 'click',
                uiState: { currentPage: 'schedule', wizard: { isOpen: true, courseId: 'TUT-2008', step: 'lecture' } },
                appState: { selectedCourses: [{ courseId: 'TUT-2008', lecture: 'TA03 - INQ SEM: Early American History' }] },
            },
            {
                selector: '#auto-schedule-btn',
                title: 'Auto Schedule',
                description: 'Click Auto Schedule to let the planner automatically find a combination of sections that fit together. It uses your active filters to avoid conflicts and respect your preferences.',
                waitFor: 'click',
                stopPropagation: true,
                uiState: { currentPage: 'schedule', wizard: { isOpen: false, courseId: null, step: null } },
            },
            {
                selector: '.as-course-card[data-course-id="TUT-2001"] .term-badge[data-term="C"]',
                title: 'Change generation parameters',
                description: 'We are going to make it so TUT2001 and TUT2006 generate only in A term. So we need to unselect the other terms.',
                waitFor: 'click',
                uiState: { currentPage: 'schedule', openModals: ['auto-schedule-intro'] },
            },
            {
                selector: '.as-course-card[data-course-id="TUT-2006"] .term-badge[data-term="C"]',
                title: 'Change generation parameters',
                description: 'Same change for TUT2006.',
                waitFor: 'click',
                uiState: { currentPage: 'schedule', openModals: ['auto-schedule-intro'] },
                appState: { autoScheduleTermPrefs: { 'TUT-2001': ['A'] } },
            },
            {
                selector: '.modal-btn[data-action="next"]',
                title: 'Move onto filters',
                description: 'After you\'re done selecting what courses you want to auto schedule for, move onto selecting filters.',
                waitFor: 'click',
                uiState: { currentPage: 'schedule', openModals: ['auto-schedule-intro'] },
                appState: { autoScheduleTermPrefs: { 'TUT-2001': ['A'], 'TUT-2006': ['A'] } },
            },
            {
                selector: '#available-only-filter',
                title: 'Filter for only available courses',
                description: 'We only want to generate schedules with courses that are not full so lets filter out the full courses.',
                waitFor: 'click',
                scrollArrow: true,
                uiState: { currentPage: 'schedule', openModals: ['auto-schedule-filter'] },
            },
            {
                selector: '#modal-primary-btn',
                title: 'Generate schedules',
                description: 'Click Generate to run the scheduler. It will find all valid section combinations based on your filters and show you the results.',
                waitFor: 'click',
                stopPropagation: true,
                uiState: { currentPage: 'schedule', openModals: ['auto-schedule-filter'] },
                appState: { filters: [{ id: 'availability', criteria: { availableOnly: true } }], refreshFilterUI: true },
            },
            {
                selector: '[data-tutorial-next]',
                title: 'Next Tutorial: schedule manager',
                description: "The next tutorial goes over how to create a new schedule and some of the settings available.",
                waitFor: 'manual',
                uiState: { currentPage: 'schedule' },
                appState: { runAutoSchedule: true },
            },
        ],
    });

    tutorialService.register({
        id: 'schedules',
        lastStepLabel: 'Finish',
        onStart: () => {
            componentWizardService.closeComponentWizard();
            setPage('planner');
        },
        steps: [
            {
                selector: '#schedule-picker-btn',
                title: 'Open the schedule manager',
                description: 'Click the Schedules button to open the schedule manager.',
                waitFor: 'click',
                uiState: { currentPage: 'planner' },
            },
            {
                selector: '.nav-tab[data-tab="settings"]',
                title: 'Settings tab',
                description: 'Click the Settings tab to see all options.',
                waitFor: 'click',
                uiState: { currentPage: 'planner', openModals: ['schedule-picker'] },
            },
            {
                selector: '[data-tutorial-next]',
                title: 'Export ICS',
                description: "The Export ICS button will export this schedule to a format that you can drag into your calendar to import.",
                waitFor: 'manual',
                uiState: { currentPage: 'planner', openModals: ['schedule-picker'], schedulePickerTab: 'settings' },
            },
            {
                selector: '[data-tutorial-next]',
                title: 'Export/Import',
                description: "This will export the course to a JSON file which then can be imported on another device. Note that if you import into an existing schedule it will add all the courses from the exported schedule onto that schedule.",
                waitFor: 'manual',
                uiState: { currentPage: 'planner', openModals: ['schedule-picker'], schedulePickerTab: 'settings' },
            },
            {
                selector: '#new-schedule-btn-settings',
                title: 'All done',
                description: "Click New Schedule, type a name, and you're all set. The tutorial will end, and you'll be taken to your new schedule automatically. The modal will not automatically close.",
                waitFor: 'click',
                uiState: { currentPage: 'planner', openModals: ['schedule-picker'], schedulePickerTab: 'settings' },
            },
            {
                selector: '[data-tutorial-next]',
                title: 'Almost there!',
                description: "Make sure to give the new schedule a name and then hit OK on the prompt.",
                waitFor: 'manual',
                uiState: { currentPage: 'planner', openModals: ['schedule-picker'], schedulePickerTab: 'settings' },
            },
        ],
    });

    tutorialService.onAppStateTransition(async (appState) => {
        if (appState.selectedCourses) {
            for (const cs of appState.selectedCourses) {
                await selectTutorialCourse(cs);
            }
        }
        if (appState.filters) {
            for (const f of appState.filters) {
                let criteria = f.criteria;
                if (f.id === 'periodConflict') {
                    const conflictCriteria = criteria as { avoidConflicts: boolean; blockedSlots: unknown[] };
                    criteria = {
                        ...conflictCriteria,
                        selectedCourses: services.courseSelectionService.getSelectedCourses(),
                    };
                }
                services.filterService.addFilter(f.id, criteria);
            }
        }
    });

    tutorialService.onPostTransition((appState) => {
        if (appState?.autoScheduleTermPrefs) {
            autoScheduleService.updateAutoScheduleIntroTerms(appState.autoScheduleTermPrefs);
        }
        // appState.refreshFilterUI used to imperatively re-sync the open filter
        // modal; the filter sections are reactive now, so applying filters to
        // filterService (in onAppStateTransition) updates the modal directly.
        if (appState?.runAutoSchedule) {
            autoScheduleService.runAutoSchedule();
        }
    });

    tutorialService.onUIStateTransition((desired) => {
        if (desired.currentPage) {
            setPage(desired.currentPage);
        }
        if (desired.wizard?.isOpen && desired.wizard.courseId) {
            const { courseId, step } = desired.wizard;
            const selected = services.courseSelectionService.getSelectedCourses()
                .find(sc => sc.course.id === courseId);
            if (selected) {
                componentWizardService.openComponentWizard(selected.course, selected, step ?? undefined);
            }
        } else if (desired.wizard && !desired.wizard.isOpen) {
            componentWizardService.closeComponentWizard();
        }
        const currentTypes = uiState.openModals;
        if (desired.openModals !== undefined) {
            const desiredTypes = desired.openModals;
            const same = currentTypes.length === desiredTypes.length
                && desiredTypes.every(t => currentTypes.includes(t));
            if (!same) {
                closeAllModals();
                for (const modalId of desiredTypes) {
                    if (modalId === 'filter-modal') {
                        modalState.filter = { mode: 'filter' };
                        openModal('filter-modal');
                    }
                    if (modalId === 'schedule-picker') openModal('schedule-picker');
                    if (modalId === 'auto-schedule') autoScheduleService.openAutoSchedule();
                    if (modalId === 'auto-schedule-intro') autoScheduleService.openAutoScheduleIntro();
                    if (modalId === 'auto-schedule-filter') autoScheduleService.openAutoScheduleFilter();
                }
            }
        } else {
            closeAllModals();
        }
        if (desired.schedulePickerTab) {
            modalState.schedulePickerTab = desired.schedulePickerTab;
        }
    });

    tutorialService.onStepApply((index) => {
        if (!stateMachine.hasSnapshot(index)) {
            stateMachine.captureSnapshot(index);
        }
    });

    registerFilteringTutorial();

    tutorialService.onComplete(() => {
        stateMachine.clear();
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
            cleanupTutorial(true);
        }
    });

    mount(FloatingTextBox, {
        target: document.body,
        props: {
            tutorialService,
            onGoBack: async () => {
                await tutorialService.goBack((targetIndex) => stateMachine.restoreSnapshot(targetIndex));
            },
        },
    });

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
        tutorialService.start(id);
    }

    return { service: tutorialService, tutorials, start, onActiveScheduleChange };
}
