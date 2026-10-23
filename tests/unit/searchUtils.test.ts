/**
 * Search relevance ranking. Asserts tier ORDERING rather than exact point
 * values, so these survive the weights being retuned.
 */
import { describe, it, expect } from 'vitest';
import {
  rankCoursesByRelevance,
  calculateRelevanceScore,
  getAvailableProfessors,
  matchCourseText,
  parseSearchQuery,
  describeMatch,
  acronymExpansions,
  foldText,
  namesHaveWord,
  textHasWord,
} from '../../src/utils/searchUtils';
import { editDistance } from '../../src/utils/editDistance';
import type { Course } from '../../src/types/types';

function course(over: Partial<Course> = {}): Course {
  return {
    id: 'CS1101',
    number: '1101',
    name: 'Introduction to Program Design',
    description: 'A first course in programming.',
    departmentAbbr: 'CS',
    departmentName: 'Computer Science',
    degreeAttributes: [],
    courseTypes: [],
    crossListedWith: [],
    minCredits: 3,
    maxCredits: 3,
    ...over,
  };
}

describe('calculateRelevanceScore', () => {
  it('scores an exact course-code match above a name match', () => {
    const c = course();
    expect(calculateRelevanceScore(c, 'cs1101')).toBeGreaterThan(
      calculateRelevanceScore(c, 'introduction to program design'),
    );
  });

  it('ignores hyphens and spaces in the query when matching a code', () => {
    const c = course();
    expect(calculateRelevanceScore(c, 'cs 1101')).toBe(
      calculateRelevanceScore(c, 'cs1101'),
    );
    expect(calculateRelevanceScore(c, 'cs-1101')).toBe(
      calculateRelevanceScore(c, 'cs1101'),
    );
  });

  it('scores an exact match above a prefix match, and a prefix above a substring', () => {
    const c = course({ name: 'Algorithms' });
    const exact = calculateRelevanceScore(c, 'algorithms');
    const prefix = calculateRelevanceScore(c, 'algo');
    const contains = calculateRelevanceScore(c, 'rithm');
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(contains);
  });

  it('returns 0 for a query matching nothing', () => {
    expect(calculateRelevanceScore(course(), 'zzzznomatch')).toBe(0);
  });

  it('gives a description-only match a non-zero but low score', () => {
    const c = course({ description: 'Covers recursion and iteration.' });
    const desc = calculateRelevanceScore(c, 'recursion');
    expect(desc).toBeGreaterThan(0);
    expect(desc).toBeLessThan(calculateRelevanceScore(c, 'cs1101'));
  });
});

describe('rankCoursesByRelevance', () => {
  it('returns the input untouched for a blank query', () => {
    const list = [course({ id: 'A' }), course({ id: 'B' })];
    expect(rankCoursesByRelevance(list, '   ')).toBe(list);
  });

  it('puts the best match first', () => {
    const cs = course({
      id: 'CS1101',
      number: '1101',
      departmentAbbr: 'CS',
      name: 'Program Design',
    });
    const ma = course({
      id: 'MA1021',
      number: '1021',
      departmentAbbr: 'MA',
      name: 'Calculus',
    });
    expect(rankCoursesByRelevance([ma, cs], 'cs1101')[0].id).toBe('CS1101');
    expect(rankCoursesByRelevance([cs, ma], 'calculus')[0].id).toBe('MA1021');
  });

  it('sorts in place, so the caller receives the same array instance', () => {
    // Documents current behaviour: callers must copy first if they need the original order.
    const list = [
      course({ id: 'A', name: 'Zebra' }),
      course({ id: 'B', name: 'Apple' }),
    ];
    expect(rankCoursesByRelevance(list, 'apple')).toBe(list);
  });
});

describe('parseSearchQuery', () => {
  it('reads a course code with or without a space or hyphen', () => {
    for (const q of ['MA 1022', 'ma1022', 'MA-1022', ' ma  1022 ']) {
      expect(parseSearchQuery(q).code).toEqual({ dept: 'ma', number: '1022' });
    }
    expect(parseSearchQuery('cs 21').code).toEqual({
      dept: 'cs',
      number: '21',
    });
    expect(parseSearchQuery('1022').code).toEqual({ dept: '', number: '1022' });
  });

  it('reads anything else as words', () => {
    expect(parseSearchQuery('Game  Design')).toMatchObject({
      code: null,
      words: ['game', 'design'],
    });
    expect(parseSearchQuery('21').code).toBeNull();
  });
});

describe('matchCourseText', () => {
  const robotics = course({
    id: 'RBE-1001-2026',
    departmentAbbr: 'RBE',
    departmentName: 'Robotics Engineering',
    number: '1001',
    name: 'Introduction To Robotics',
    description: 'Robots and their sensors.',
  });
  const match = (q: string, c = robotics) =>
    matchCourseText(c, parseSearchQuery(q)).all;

  it('needs every word, each anywhere in the course', () => {
    expect(match('robotics sensors')).toBe(true);
    expect(match('robotics cooking')).toBe(false);
  });

  it('forgives one typo in a word of five letters or more', () => {
    expect(match('robtics')).toBe(true);
    expect(match('robotcs')).toBe(true);
    expect(match('rbootics')).toBe(true);
    // Short words must match as typed.
    expect(match('rbe')).toBe(true);
    expect(match('reb')).toBe(false);
  });

  it('matches a code by prefix, and a description that names it', () => {
    expect(match('RBE 1001')).toBe(true);
    expect(match('rbe10')).toBe(true);
    expect(match('RBE 1002')).toBe(false);
    const after = course({ description: 'Recommended background: RBE 1001.' });
    expect(match('RBE 1001', after)).toBe(true);
  });

  it('searches degree attributes and cross-listed codes', () => {
    const ss = course({
      degreeAttributes: ['Social Sciences'],
      crossListedWith: ['MA 543'],
    });
    expect(match('social sciences', ss)).toBe(true);
    expect(match('MA 543', ss)).toBe(true);
  });
});

describe('ranking', () => {
  const make = (
    departmentAbbr: string,
    number: string,
    name: string,
    departmentName = departmentAbbr,
    description = '',
  ) =>
    course({
      id: `${departmentAbbr}-${number}-2026`,
      departmentAbbr,
      departmentName,
      number,
      name,
      description,
    });
  const ids = (list: Course[], q: string) =>
    rankCoursesByRelevance([...list], q).map(c => c.id);

  it('puts title matches above description matches', () => {
    const list = [
      make(
        'CS',
        '4801',
        'Cryptography',
        'Computer Science',
        'game design of protocols',
      ),
      make('IMGD', '2900', 'Digital Game Design I'),
    ];
    expect(ids(list, 'game design')[0]).toBe('IMGD-2900-2026');
  });

  it('puts the introductory robotics course first', () => {
    const list = [
      make('BME', '520', 'Biomechanics And Robotics', 'Biomedical Engineering'),
      make('RBE', '2001', 'Unified Robotics I', 'Robotics Engineering'),
      make('RBE', '1001', 'Introduction To Robotics', 'Robotics Engineering'),
      make('CS', '1005', 'Programming', 'Computer Science', 'robotics'),
    ];
    expect(ids(list, 'robotics')[0]).toBe('RBE-1001-2026');
    expect(ids(list, 'robtics')[0]).toBe('RBE-1001-2026');
  });

  it('puts the course a code names first, ahead of courses mentioning it', () => {
    const list = [
      make(
        'MA',
        '1023',
        'Calculus III',
        'Math',
        'Recommended background: MA 1022.',
      ),
      make('MA', '1022', 'Calculus II'),
    ];
    expect(ids(list, 'MA 1022')[0]).toBe('MA-1022-2026');
  });
});

describe('short words, acronyms and numerals', () => {
  const make = (
    departmentAbbr: string,
    number: string,
    name: string,
    description = '',
    departmentName = departmentAbbr,
  ) =>
    course({
      id: `${departmentAbbr}-${number}-2026`,
      departmentAbbr,
      departmentName,
      number,
      name,
      description,
    });
  const ids = (list: Course[], q: string) =>
    rankCoursesByRelevance([...list], q).map(c => c.id);
  const matches = (q: string, c: Course) =>
    matchCourseText(c, parseSearchQuery(q)).all;

  const aircraft = make('AE', '4510', 'Aircraft Design', 'Air breathing.');
  const writing = make('IMGD', '2200', 'AI in Writing');
  const intro = make(
    'CS',
    '4341',
    'Introduction To Artificial Intelligence',
    'Search and planning.',
  );
  // Defines the acronym for the whole catalog.
  const definer = make(
    'DS',
    '1010',
    'Data Science I',
    'Covers artificial intelligence (AI) basics.',
  );
  const accelerated = make('CS', '1102', 'Accelerated Introduction');

  it('matches a short word only as a whole word', () => {
    expect(matches('AI', aircraft)).toBe(false);
    expect(matches('AI', writing)).toBe(true);
    expect(matches('art', make('HU', '1', 'Humanities and Arts'))).toBe(true);
  });

  it('reads an acronym as the name words the catalog defines it as', () => {
    const list = [aircraft, accelerated, intro, definer, writing];
    expect(
      rankCoursesByRelevance([...list], 'AI')
        .filter(c => matches('AI', c))
        .map(c => c.id),
      // DS 1010 only says AI in its description.
    ).toEqual(['IMGD-2200-2026', 'CS-4341-2026', 'DS-1010-2026']);
    // Initials alone are not enough: "Accelerated Introduction" is not AI.
    expect(matches('AI', accelerated)).toBe(false);
    expect(describeMatch(intro, 'AI')).toBe('title');
  });

  it('ranks a spelled-out acronym level with the word itself', () => {
    rankCoursesByRelevance([definer], 'AI');
    const spelled = make('ENV', '2720', 'Artificial Intelligence and Society');
    const literal = make('IMGD', '2720', 'AI in Writing and Society');
    const diff =
      calculateRelevanceScore(spelled, 'AI') -
      calculateRelevanceScore(literal, 'AI');
    // Only the tie-breaks (name length) tell them apart.
    expect(Math.abs(diff)).toBeLessThan(1);
    expect(acronymExpansions('ai')).toEqual(['artificial intelligence']);
  });

  it('puts what a student can take first among equal matches', () => {
    const lecture = (seatsAvailable: number) =>
      ({
        lectures: [
          {
            section: { crn: seatsAvailable, seatsAvailable, periods: [] },
            compatibleDiscussions: [],
            compatibleLabs: [],
          },
        ],
      }) as unknown as Partial<Course>;
    const full = course({ ...make('CS', '2001', 'Robotics'), ...lecture(0) });
    const open = course({ ...make('CS', '2002', 'Robotics'), ...lecture(5) });
    const higher = course({ ...make('CS', '3001', 'Robotics'), ...lecture(5) });
    const graduate = course({
      ...make('CS', '4001', 'Robotics'),
      ...lecture(5),
      isGraduate: true,
    });
    // Open seats outweigh one level, undergraduate a level and more; a
    // weaker match is never lifted over a stronger one.
    expect(ids([graduate, higher, full, open], 'robotics')).toEqual([
      'CS-2002-2026',
      'CS-3001-2026',
      'CS-2001-2026',
      'CS-4001-2026',
    ]);
    const weak = course({
      ...make('CS', '1000', 'Other', 'All about robotics.'),
      ...lecture(5),
    });
    expect(ids([weak, full], 'robotics')).toEqual([
      'CS-2001-2026',
      'CS-1000-2026',
    ]);
  });

  it('treats Roman numerals as digits and takes a prefix of a long word', () => {
    const list = [
      make('MA', '3475', 'Calculus Of Variations', 'Calculus 2 and more.'),
      make('MA', '1022', 'Calculus II', 'Continues calculus 1.'),
      make('MA', '1021', 'Calculus I'),
    ];
    for (const q of ['calc 1', 'calculus 1', 'calc I', 'calculus I']) {
      expect(ids(list, q)[0], q).toBe('MA-1021-2026');
    }
    for (const q of ['calc 2', 'calculus 2', 'calculus II']) {
      expect(ids(list, q)[0], q).toBe('MA-1022-2026');
    }
    // A description repeating a title word does not lift its course.
    expect(ids(list, 'calculus')).toEqual([
      'MA-1021-2026',
      'MA-1022-2026',
      'MA-3475-2026',
    ]);
  });

  it('keeps the code tier when words follow the code, however it is written', () => {
    const list = [
      make('MA', '1033', 'Theoretical Calculus III', 'After MA 1022.'),
      make('MA', '1022', 'Calculus II'),
    ];
    expect(ids(list, 'MA 1022 calculus')).toEqual([
      'MA-1022-2026',
      'MA-1033-2026',
    ]);
    for (const q of ['MA 1022', 'MA-1022', 'MA_1022', 'ma1o22']) {
      expect(parseSearchQuery(q).code, q).toEqual({
        dept: 'ma',
        number: '1022',
      });
    }
    expect(describeMatch(list[0], 'MA 1022')).toBe('mentions');
  });

  it('tells a section title match from an instructor or room match', () => {
    const titled = (number: string, professor: string) =>
      course({
        ...make('ECON', '2800', 'Special Topics in Economics'),
        lectures: [
          {
            section: {
              crn: 1,
              number,
              periods: [{ professor, location: 'Atwater Kent 233' }],
            },
            compatibleDiscussions: [],
            compatibleLabs: [],
          },
        ],
      } as unknown as Partial<Course>);
    expect(
      describeMatch(titled('B01 - ST: AI and Economics', 'Ann Lee'), 'AI'),
    ).toBe('sectionTitle');
    expect(describeMatch(titled('B01', 'Ann Lee'), 'Lee')).toBe('section');
  });

  it('reads "and" in a department name as the catalog\'s "&"', () => {
    const imgd = make(
      'IMGD',
      '1001',
      'The Game Development Process',
      'Teams build games.',
      'Interactive Media & Game Development',
    );
    for (const q of [
      'interactive media and game development',
      'Interactive Media & Game Development',
    ]) {
      expect(matches(q, imgd)).toBe(true);
      expect(describeMatch(imgd, q)).toBe('title');
    }
  });

  it('lists the courses of a department its name names, by number', () => {
    const list = [
      make('CS', '588', 'Computer Science Capstone', '', 'Computer Science'),
      make('BCB', '4002', 'Computer Science for Biology', '', 'Biology'),
      make('CS', '1101', 'Program Design', '', 'Computer Science'),
    ];
    expect(ids(list, 'computer science')).toEqual([
      'CS-1101-2026',
      'CS-588-2026',
      'BCB-4002-2026',
    ]);
  });

  it('tells words written together from words far apart', () => {
    const near = make(
      'CS',
      '4732',
      'Animation',
      'procedural content generation',
    );
    const far = make(
      'ECE',
      '5522',
      'Relaying',
      'procedural rules for relays, with power generation',
    );
    expect(describeMatch(near, 'procedural generation')).toBe('description');
    expect(describeMatch(far, 'procedural generation')).toBe('scattered');
  });
});

describe('accents', () => {
  it('folds case and accents alike', () => {
    expect(foldText('EJ Néel')).toBe('ej neel');
    expect(foldText('San Martín')).toBe('san martin');
    expect(foldText('Karl-Frédéric')).toBe('karl-frederic');
    expect(foldText('Plain')).toBe('plain');
  });

  it('matches queries and course text with or without accents', () => {
    const french = course({
      name: 'Études Françaises',
      description: 'Le cinéma et la société.',
    });
    for (const q of ['etudes', 'études', 'francaises', 'cinema societe']) {
      expect(matchCourseText(french, parseSearchQuery(q)).all).toBe(true);
      expect(calculateRelevanceScore(french, q)).toBeGreaterThan(0);
    }
    expect(parseSearchQuery('Frédéric').words).toEqual(['frederic']);
  });

  it('finds names in section text either way', () => {
    expect(namesHaveWord('ej néel', 'neel')).toBe(true);
    expect(namesHaveWord('William San Martín', 'martin')).toBe(true);
    expect(textHasWord('Frédéric Vieux', 'frederic')).toBe(true);
  });
});

describe('query words that name object members', () => {
  it('reads "constructor" and "toString" as plain words', () => {
    const oop = course({
      name: 'Object-Oriented Design',
      description: 'Classes, a constructor for each, and toString methods.',
    });
    for (const q of ['constructor', 'toString', '__proto__', 'valueOf']) {
      expect(parseSearchQuery(q).words.every(w => typeof w === 'string')).toBe(
        true,
      );
      expect(() => calculateRelevanceScore(oop, q)).not.toThrow();
      expect(() => describeMatch(oop, q)).not.toThrow();
    }
    expect(matchCourseText(oop, parseSearchQuery('constructor')).all).toBe(
      true,
    );
    expect(matchCourseText(course(), parseSearchQuery('constructor')).all).toBe(
      false,
    );
  });
});

describe('editDistance', () => {
  it('counts a swap as one edit', () => {
    expect(editDistance('robtoics', 'robotics')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });

  it('measures against a prefix when asked', () => {
    expect(editDistance('robtic', 'robotics', 1, true)).toBe(1);
    expect(editDistance('robtic', 'robotics', 1)).toBe(2);
  });
});

describe('getAvailableProfessors', () => {
  it('returns an empty list when there are no sections', () => {
    expect(getAvailableProfessors([course()])).toEqual([]);
  });

  it('handles an empty course list', () => {
    expect(getAvailableProfessors([])).toEqual([]);
  });
});
