import { describe, it, expect } from 'vitest';
import { stateAt } from '../../src/services/tutorial/tutorialState';
import type { Tutorial } from '../../src/types/tutorial';

const tutorial: Tutorial = {
  id: 't',
  start: { page: 'schedule', courses: { A: { lecture: 'L1' } } },
  steps: [
    {
      waitFor: 'click',
      selector: '#a',
      title: 'a',
      description: '',
      does: { courses: { A: { lab: 'X1' }, B: {} }, wizard: null },
    },
    {
      waitFor: 'click',
      selector: '#b',
      title: 'b',
      description: '',
      drawer: 'schedule',
      does: {
        wizard: { courseId: 'B', step: 'lab' },
        filters: { term: { terms: ['B'] } },
        ranking: { earlyClasses: 'high' },
      },
    },
    {
      waitFor: 'manual',
      title: 'c',
      description: '',
      does: {
        filters: { availability: { availableOnly: true } },
        ranking: { gaps: 'low' },
        modal: 'filter-modal',
        generated: true,
      },
    },
    { waitFor: 'manual', title: 'd', description: '' },
  ],
};

describe('stateAt', () => {
  it('starts from defaults plus the tutorial start', () => {
    const state = stateAt(tutorial, 0);

    expect(state).toEqual({
      page: 'schedule',
      wizard: null,
      modal: null,
      courses: { A: { lecture: 'L1' } },
      filters: {},
      ranking: {},
      viewing: null,
      generated: false,
    });
  });

  it('leaves a step out of the state it arrives at', () => {
    expect(stateAt(tutorial, 1).courses.B).toEqual({});
    expect(stateAt(tutorial, 0).courses.B).toBeUndefined();
  });

  it('merges courses per pick, so a lecture and a lab both stay', () => {
    expect(stateAt(tutorial, 1).courses.A).toEqual({
      lecture: 'L1',
      lab: 'X1',
    });
  });

  it('merges filters and ranking by key and replaces the rest', () => {
    const state = stateAt(tutorial, 3);

    expect(state.filters).toEqual({
      term: { terms: ['B'] },
      availability: { availableOnly: true },
    });
    expect(state.ranking).toEqual({ earlyClasses: 'high', gaps: 'low' });
    expect(state.wizard).toEqual({ courseId: 'B', step: 'lab' });
    expect(state.modal).toBe('filter-modal');
    expect(state.generated).toBe(true);
  });

  it('does not carry a drawer forward or share objects with the start', () => {
    const state = stateAt(tutorial, 3);
    state.courses.A.lecture = 'changed';

    expect(stateAt(tutorial, 3).courses.A.lecture).toBe('L1');
    expect(Object.keys(state)).not.toContain('drawer');
  });
});
