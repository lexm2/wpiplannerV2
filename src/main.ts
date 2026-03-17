import './style.css'
import { MainController } from './ui/controllers/MainController'
import { DeviceDetection } from './utils/deviceDetection'
import { MobileNoticeModal } from './ui/components/MobileNoticeModal'
import { AppBootstrap } from './bootstrap/AppBootstrap'
import { FloatingTextBox } from './ui/components/FloatingTextBox'
import { TutorialService } from './services/tutorial/TutorialService'

DeviceDetection.initialize();

const isFirstVisit = !localStorage.getItem('wpi_visited');
if (isFirstVisit) {
    localStorage.setItem('wpi_visited', 'true');
}

const services = AppBootstrap.createServices();
const mainController = new MainController(services);

if (DeviceDetection.isMobilePhone()) {
    new MobileNoticeModal(services.modalService).show();
}

const tutorialService = new TutorialService();
tutorialService.register({
    id: 'welcome',
    steps: [
        {
            selector: '[data-course-id="TUT-1001"] .course-select-btn',
            title: 'Select a course',
            description: 'Click the + button on the Tutorial course to add it to your planner.',
            waitFor: 'click',
            waitForSelector: '[data-course-id="TUT-1001"] .course-select-btn',
        },
        {
            selector: '#schedule-tab',
            title: 'Go to the Schedule tab',
            description: 'Head to the Schedule tab to start setting up your sections.',
            waitFor: 'click',
        },
        {
            selector: '.schedule-course-item',
            title: 'Open section selection',
            description: 'Click the course you just added to open the section picker.',
            waitFor: 'click',
        },
        {
            selector: '.wizard-section-card',
            title: 'Pick a lecture',
            description: 'Select a lecture section.',
            waitFor: 'click',
        },
        {
            selector: '.wizard-btn.wizard-btn-primary',
            title: 'Continue to labs',
            description: 'Click Next to move on to selecting a lab.',
            waitFor: 'click',
        },
        {
            selector: '.wizard-section-card[data-crn="99902"]',
            title: 'Pick a lab',
            description: 'Select a lab section.',
            waitFor: 'click',
        },
        {
            selector: '[data-tutorial-next]',
            title: 'See it on the grid',
            description: 'Your course now appears on the schedule. You\'re all set!',
            waitFor: 'manual',
        },
    ],
});

function getTutorialCourse(id: string) {
    return services.courseDataService.getAllDepartments()
        .flatMap(d => d.courses)
        .find(c => c.id === id);
}

async function startFilteringTutorial() {
    const priorYear = services.courseDataService.getLatestAcademicYear()! - 1;

    const tut1002 = getTutorialCourse('TUT-1002');
    if (tut1002) {
        await services.courseSelectionService.selectCourse(tut1002);
        const lecture = tut1002.lectures[0].section;
        const lab = tut1002.lectures[0].compatibleLabs[0] ?? null;
        await services.courseSelectionService.setSelectedComponents(tut1002, lecture, null, lab);
    }

    tutorialService.register({
        id: 'filtering',
        steps: [
            {
                selector: '#planner-tab',
                title: 'Go to the planner',
                description: 'Head back to the Classes tab to see your courses.',
                waitFor: 'click',
            },
            {
                selector: '#filter-btn',
                title: 'Open filters',
                description: 'Click the filter button to open course filters.',
                waitFor: 'click',
            },
            {
                selector: 'input.filter-toggle[value="A"][data-filter="term"]',
                title: 'Filter by term',
                description: 'Check the A term box to filter courses by term.',
                waitFor: 'click',
            },
            {
                selector: `.segmented-btn[data-year="${priorYear}"]`,
                title: 'Change the academic year',
                description: `Switch to ${priorYear}–${priorYear + 1} to see courses from a prior year.`,
                waitFor: 'click',
            },
            {
                selector: '#available-only-filter',
                title: 'Show available courses only',
                description: 'Toggle this to hide courses with no open seats.',
                waitFor: 'click',
            },
            {
                selector: '#avoid-conflicts-filter',
                title: 'Avoid schedule conflicts',
                description: 'Toggle this to hide courses that conflict with your current schedule.',
                waitFor: 'click',
            },
            {
                selector: '#modal-primary-btn',
                title: 'Apply filters',
                description: 'Click Apply to close the filter panel and see your filtered results.',
                waitFor: 'click',
            },
        ],
    });

    tutorialService.start('filtering');
}

let filteringStarted = false;
tutorialService.onComplete(() => {
    if (!filteringStarted) {
        filteringStarted = true;
        startFilteringTutorial();
    } else {
        services.courseDataService.hideTutorialDepartment();
    }
});

new FloatingTextBox(tutorialService).mount();

// TODO: only start on first visit once tutorial content is finalized
tutorialService.start('welcome');

// Expose main controller globally for development/testing
declare global {
    interface Window {
        mainController: MainController;
    }
}
window.mainController = mainController;
