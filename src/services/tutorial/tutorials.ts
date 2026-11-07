import type { Tutorial, TutorialPicks } from '../../types/tutorial';

// What the avoid-conflicts toggle itself sets, so the panel reads the same
// either way. The sections it blocks against are filled in from the selection.
const AVOID_CONFLICTS = {
  avoidConflicts: true,
  blockedSlots: [],
  semesterSpansQuarters: true,
};

// A fuller schedule for the filtering tutorial to work on: B term has only two
// classes in it.
const FILLED_SCHEDULE: Record<string, TutorialPicks> = {
  'TUT-2001': { lecture: 'TAL01', lab: 'TAX01' },
  'TUT-2002': { lecture: 'TDL01', lab: 'TDX02' },
  'TUT-2003': { lecture: 'TC01' },
  'TUT-2004': { lecture: 'TDL02', discussion: 'TDD02' },
  'TUT-2006': { lecture: 'TAL01', lab: 'TAX01' },
  'TUT-2007': { lecture: 'TCL01', lab: 'TCX01' },
  'TUT-2008': {
    lecture: 'TA01 - INQ SEM: Integrating the Humanities in STEM Education',
  },
  'TUT-2009': { lecture: 'TBL01', lab: 'TBX01' },
  'TUT-2010': { lecture: 'TD01' },
  'TUT-2011': { lecture: 'TC01' },
  'TUT-2012': { lecture: 'TBL01', lab: 'TBX02' },
};

const welcome: Tutorial = {
  id: 'welcome',
  start: { page: 'planner' },
  steps: [
    {
      waitFor: 'manual',
      title: 'Welcome to the WPI Planner',
      description:
        "This tour shows you how to plan your classes. A dashed outline marks what to click next. Right now it's on Next, because this step is just for reading. If you lose track of it, Find Element points it out.",
    },
    {
      waitFor: 'manual',
      about: '#course-container',
      title: 'Find your classes',
      description:
        "A solid outline marks what a step is talking about, like this list of every course. Right now it only shows practice courses made for this tour. Pick a department or search by name or number to narrow the list. Where there's room, the letters on a row show the terms it runs in.",
    },
    {
      waitFor: 'click',
      selector: '[data-course-id="TUT-2001"] [data-open-btn]',
      scrollArrow: true,
      title: 'See what a course is about',
      description:
        'Click the highlighted course code to read about Introduction to Robot Wrangling.',
      does: { viewing: 'TUT-2001' },
    },
    {
      waitFor: 'manual',
      about: '#course-description',
      drawer: 'details',
      title: 'Course details',
      description:
        'Its times, professors and open seats show up here. Real courses have a description too.',
    },
    {
      waitFor: 'click',
      selector: '[data-course-id="TUT-2001"] [data-select-btn]',
      scrollArrow: true,
      title: 'Add it to your planner',
      description: 'Click the + to add this course to your planner.',
      does: { courses: { 'TUT-2001': {} } },
    },
    {
      waitFor: 'click',
      selector: '#schedule-tab',
      title: 'Go to the Schedule tab',
      description: "You choose when you'll take a course on the Schedule tab.",
      does: { page: 'schedule' },
    },
    {
      waitFor: 'click',
      selector: '.schedule-course-item[data-course-id="TUT-2001"]',
      drawer: 'schedule',
      title: 'Pick its sections',
      description:
        "Adding a course doesn't choose a time yet. Click it to see its sections.",
      does: { wizard: { courseId: 'TUT-2001', step: 'lecture' } },
    },
    {
      waitFor: 'click',
      selector: '[data-crn="100108"]',
      drawer: 'schedule',
      title: 'Pick a lecture',
      description:
        'Each card is a time this course runs. Hover one to preview it on your schedule, then click this lecture to choose it.',
      does: { courses: { 'TUT-2001': { lecture: 'TCL01' } } },
    },
    {
      waitFor: 'click',
      selector: '#wizard-next-btn',
      drawer: 'schedule',
      title: 'Continue to labs',
      description: 'This course also has a lab. Click Next to choose one.',
      does: { wizard: { courseId: 'TUT-2001', step: 'lab' } },
    },
    {
      waitFor: 'click',
      selector: '[data-crn="100111"]',
      drawer: 'schedule',
      title: 'Pick a lab',
      description: 'Click this lab to choose it.',
      does: { courses: { 'TUT-2001': { lab: 'TCX03' } } },
    },
    {
      waitFor: 'click',
      selector: '#wizard-next-btn',
      drawer: 'schedule',
      title: 'Finish',
      description: 'Click Finish to save your picks.',
      does: { wizard: null },
    },
    {
      waitFor: 'manual',
      about: '[data-terms-grid]',
      title: 'Your schedule',
      description:
        'Your course is on your schedule now. Each term has its own grid. To change your picks, click the course in the list. The buttons on its row clear its sections or remove it.',
    },
    {
      waitFor: 'manual',
      about: '#settings-menu-btn',
      title: 'Next Tutorial: Filtering',
      description:
        "That's the basics. Next up: finding a course that fits what you already have. To leave the tour, hit Skip tutorial. To run any part again, open the gear menu at the top right and choose Tutorials.",
    },
  ],
};

const filtering: Tutorial = {
  id: 'filtering',
  start: { page: 'schedule', courses: FILLED_SCHEDULE },
  steps: [
    {
      waitFor: 'click',
      selector: '#planner-tab',
      title: 'Go to the Classes tab',
      description:
        "Here's a fuller schedule. B term only has two classes, so let's find a third that fits. Head to the Classes tab.",
      does: { page: 'planner' },
    },
    {
      waitFor: 'click',
      selector: '#filter-btn',
      title: 'Open filters',
      description: 'Click the filter button to narrow down the list.',
      does: { modal: 'filter-modal' },
    },
    {
      // The label, since narrow windows shrink the input itself to nothing.
      waitFor: 'click',
      selector: 'label[data-term-option="B"]',
      scrollArrow: true,
      title: 'Filter by term',
      description: 'Tick B to list only courses that run in B term.',
      does: { filters: { term: { terms: ['B'] } } },
    },
    {
      waitFor: 'click',
      selector: 'label:has(> #avoid-conflicts-filter)',
      scrollArrow: true,
      title: 'Hide conflicts',
      description:
        "Tick this to hide class times that clash with the sections you've picked. The option below it hides full sections, and everything else is under More filters.",
      does: { filters: { periodConflict: AVOID_CONFLICTS } },
    },
    {
      waitFor: 'click',
      selector: '#modal-primary-btn',
      title: 'Close the filters',
      description:
        "Filters apply as you set them. Click Done to see what's left.",
      does: { modal: null },
    },
    {
      waitFor: 'click',
      selector: '[data-course-id="TUT-2005"] [data-select-btn]',
      scrollArrow: true,
      title: 'Add Blinking LEDs 101',
      description: 'This course fits. Click its + to add it.',
      does: { courses: { 'TUT-2005': {} } },
    },
    {
      waitFor: 'manual',
      about: '#filter-btn',
      title: 'Next Tutorial: Auto Scheduling',
      description:
        "It's on your schedule, and you'd pick its sections on the Schedule tab the same way as before. Filters stay on until you open this and clear them. Next up: letting the planner choose sections for you.",
    },
  ],
};

const autoSchedule: Tutorial = {
  id: 'autoSchedule',
  start: {
    page: 'schedule',
    courses: {
      'TUT-2001': { lecture: 'TCL01', lab: 'TCX03' },
      'TUT-2002': {},
      'TUT-2003': {},
      'TUT-2005': {},
      'TUT-2006': {},
      'TUT-2011': {},
    },
  },
  steps: [
    {
      waitFor: 'click',
      selector: '#auto-schedule-btn',
      drawer: 'schedule',
      title: 'Auto-Schedule',
      description:
        'Most of these courses have no sections yet. Click Auto-Schedule and the planner will choose them for you.',
      does: { modal: 'auto-schedule-intro' },
    },
    {
      waitFor: 'manual',
      about: '.as-course-grid',
      title: 'Choose what to schedule',
      description:
        "Courses you've already picked sections for stay as they are, and the rest get scheduled. Click a course to change that, or a term letter to keep it out of that term. Leave them as they are for now.",
    },
    {
      waitFor: 'click',
      selector: '.modal-btn[data-action="next"]',
      title: 'On to your preferences',
      description: 'Click Next in this window.',
      does: { modal: 'auto-schedule-filter' },
    },
    {
      waitFor: 'manual',
      about: '[data-ranking-list]',
      title: 'Schedule preferences',
      description:
        'These decide which schedules come first. They never rule one out. By default the planner avoids full sections and spreads your courses evenly across terms.',
    },
    {
      waitFor: 'click',
      selector: '[data-ranking="earlyClasses"] label:has(input[value="high"])',
      scrollArrow: true,
      title: 'Set a preference',
      description:
        "Say you'd rather not have early classes. Set Early classes to High.",
      does: { ranking: { earlyClasses: 'high' } },
    },
    {
      waitFor: 'click',
      selector: '#modal-primary-btn',
      title: 'Generate',
      description: 'Click Generate Schedule to build it.',
      does: { modal: null, generated: true },
    },
    {
      waitFor: 'manual',
      about: '.schedule-nav-buttons',
      drawer: 'schedule',
      title: 'Next Tutorial: Managing Schedules',
      description:
        "Here's a schedule that fits. The arrows step through other options, and the button between them takes you back to the settings. Next up: keeping more than one schedule.",
    },
  ],
};

const schedules: Tutorial = {
  id: 'schedules',
  lastStepLabel: 'Finish',
  start: { page: 'planner' },
  steps: [
    {
      waitFor: 'click',
      selector: '#schedule-picker-btn',
      title: 'Open your schedules',
      description: 'Click Schedules to see them all.',
      // The header hides the button here, so the gear menu holds it.
      compact: {
        selector: '#settings-schedules-btn',
        via: '#settings-menu-btn',
        description:
          'Open the gear menu at the top right, then choose Schedules.',
      },
      does: { modal: 'schedule-picker' },
    },
    {
      waitFor: 'manual',
      about: '.schedule-picker-modal-dialog .schedule-list',
      title: 'Your schedules',
      description:
        'Every schedule you have is listed here. Click one to switch to it, though doing that now ends this tutorial. Rename and Duplicate sit on each row, and the ⋮ menu holds everything else.',
    },
    {
      waitFor: 'manual',
      about: '.schedule-picker-modal-dialog [aria-haspopup="menu"]',
      title: 'Take it with you',
      description:
        "In a schedule's ⋮ menu, Export ICS saves a file you can add to your calendar app. Export and Import move a schedule to another device.",
    },
    {
      waitFor: 'manual',
      about: '#new-schedule-btn',
      title: 'Start your own',
      description:
        "New Schedule starts a fresh one. Create one now and you'll land on it, which ends the tutorials, or hit Finish.",
    },
  ],
};

/** In the order they chain. */
export const TUTORIALS: Tutorial[] = [
  welcome,
  filtering,
  autoSchedule,
  schedules,
];
