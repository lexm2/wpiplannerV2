import type {
  Tutorial,
  TutorialPicks,
  TutorialState,
} from '../../types/tutorial';

const DEFAULTS: TutorialState = {
  page: 'planner',
  wizard: null,
  modal: null,
  courses: {},
  filters: {},
  ranking: {},
  viewing: null,
  generated: false,
};

function apply(
  state: TutorialState,
  change: Partial<TutorialState>,
): TutorialState {
  const next: TutorialState = { ...state, ...change };
  if (change.courses) {
    // Per pick, so a lecture step and a lab step each add to the same course.
    const courses: Record<string, TutorialPicks> = { ...state.courses };
    for (const [id, picks] of Object.entries(change.courses)) {
      courses[id] = { ...courses[id], ...picks };
    }
    next.courses = courses;
  }
  if (change.filters) next.filters = { ...state.filters, ...change.filters };
  if (change.ranking) next.ranking = { ...state.ranking, ...change.ranking };
  return next;
}

/**
 * What the app must look like at a step: the tutorial's start with the effect
 * of every earlier step applied. Pure, so every way of arriving at a step (a
 * click, Next, Back, a layout change) lands on the same state.
 */
export function stateAt(tutorial: Tutorial, index: number): TutorialState {
  let state = apply(
    { ...DEFAULTS, courses: {}, filters: {}, ranking: {} },
    tutorial.start,
  );
  for (const step of tutorial.steps.slice(0, index)) {
    if (step.does) state = apply(state, step.does);
  }
  return state;
}
