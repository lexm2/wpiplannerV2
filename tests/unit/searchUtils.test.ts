/**
 * Search relevance ranking. Asserts tier ORDERING rather than exact point
 * values, so these survive the weights being retuned.
 */
import { describe, it, expect } from 'vitest';
import {
  getAvailableProfessors,
  foldText,
  MAX_QUERY_WORDS,
  namesHaveWord,
  SearchIndex,
  textHasWord,
} from '../../src/utils/searchUtils';
import { editDistance } from '../../src/utils/editDistance';
import type { Course } from '../../src/types/types';

// One index for the file, as for one catalog: what a course's text teaches
// (acronyms, departments) applies to the courses read after it.
const search = new SearchIndex();

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

describe('SearchIndex.score', () => {
  it('scores an exact course-code match above a name match', () => {
    const c = course();
    expect(search.score(c, 'cs1101')).toBeGreaterThan(
      search.score(c, 'introduction to program design'),
    );
  });

  it('ignores hyphens and spaces in the query when matching a code', () => {
    const c = course();
    expect(search.score(c, 'cs 1101')).toBe(search.score(c, 'cs1101'));
    expect(search.score(c, 'cs-1101')).toBe(search.score(c, 'cs1101'));
  });

  it('scores an exact match above a prefix match, and a prefix above a substring', () => {
    const c = course({ name: 'Algorithms' });
    const exact = search.score(c, 'algorithms');
    const prefix = search.score(c, 'algo');
    const contains = search.score(c, 'rithm');
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(contains);
  });

  it('returns 0 for a query matching nothing', () => {
    expect(search.score(course(), 'zzzznomatch')).toBe(0);
  });

  it('gives a description-only match a non-zero but low score', () => {
    const c = course({ description: 'Covers recursion and iteration.' });
    const desc = search.score(c, 'recursion');
    expect(desc).toBeGreaterThan(0);
    expect(desc).toBeLessThan(search.score(c, 'cs1101'));
  });
});

describe('SearchIndex.rank', () => {
  it('returns the input untouched for a blank query', () => {
    const list = [course({ id: 'A' }), course({ id: 'B' })];
    expect(search.rank(list, '   ')).toBe(list);
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
    expect(search.rank([ma, cs], 'cs1101')[0].id).toBe('CS1101');
    expect(search.rank([cs, ma], 'calculus')[0].id).toBe('MA1021');
  });

  it('sorts in place, so the caller receives the same array instance', () => {
    // Documents current behaviour: callers must copy first if they need the original order.
    const list = [
      course({ id: 'A', name: 'Zebra' }),
      course({ id: 'B', name: 'Apple' }),
    ];
    expect(search.rank(list, 'apple')).toBe(list);
  });
});

describe('SearchIndex.parse', () => {
  it('reads a course code with or without a space or hyphen', () => {
    for (const q of ['MA 1022', 'ma1022', 'MA-1022', ' ma  1022 ']) {
      expect(search.parse(q).code).toEqual({ dept: 'ma', number: '1022' });
    }
    expect(search.parse('cs 21').code).toEqual({
      dept: 'cs',
      number: '21',
    });
    expect(search.parse('1022').code).toEqual({ dept: '', number: '1022' });
  });

  it('reads anything else as words', () => {
    expect(search.parse('Game  Design')).toMatchObject({
      code: null,
      words: ['game', 'design'],
    });
    expect(search.parse('21').code).toBeNull();
  });
});

describe('matchCourseWords', () => {
  const robotics = course({
    id: 'RBE-1001-2026',
    departmentAbbr: 'RBE',
    departmentName: 'Robotics Engineering',
    number: '1001',
    name: 'Introduction To Robotics',
    description: 'Robots and their sensors.',
  });
  const match = (q: string, c = robotics) =>
    search.matchCourseWords(c, search.parse(q)).all;

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
    search.rank([...list], q).map(c => c.id);

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
    search.rank([...list], q).map(c => c.id);
  const matches = (q: string, c: Course) =>
    search.matchCourseWords(c, search.parse(q)).all;

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
      search
        .rank([...list], 'AI')
        .filter(c => matches('AI', c))
        .map(c => c.id),
      // DS 1010 only says AI in its description.
    ).toEqual(['IMGD-2200-2026', 'CS-4341-2026', 'DS-1010-2026']);
    // Initials alone are not enough: "Accelerated Introduction" is not AI.
    expect(matches('AI', accelerated)).toBe(false);
    expect(search.describeMatch(intro, 'AI')).toBe('title');
  });

  it('ranks a spelled-out acronym level with the word itself', () => {
    search.rank([definer], 'AI');
    const spelled = make('ENV', '2720', 'Artificial Intelligence and Society');
    const literal = make('IMGD', '2720', 'AI in Writing and Society');
    const diff = search.score(spelled, 'AI') - search.score(literal, 'AI');
    // Only the tie-breaks (name length) tell them apart.
    expect(Math.abs(diff)).toBeLessThan(1);
    expect(search.acronymExpansions('ai')).toEqual(['artificial intelligence']);
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
      expect(search.parse(q).code, q).toEqual({
        dept: 'ma',
        number: '1022',
      });
    }
    expect(search.describeMatch(list[0], 'MA 1022')).toBe('mentions');
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
              periods: [
                { instructors: [professor], location: 'Atwater Kent 233' },
              ],
            },
            compatibleDiscussions: [],
            compatibleLabs: [],
          },
        ],
      } as unknown as Partial<Course>);
    expect(
      search.describeMatch(
        titled('B01 - ST: AI and Economics', 'Ann Lee'),
        'AI',
      ),
    ).toBe('sectionTitle');
    expect(search.describeMatch(titled('B01', 'Ann Lee'), 'Lee')).toBe(
      'section',
    );
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
      expect(search.describeMatch(imgd, q)).toBe('title');
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
    expect(search.describeMatch(near, 'procedural generation')).toBe(
      'description',
    );
    expect(search.describeMatch(far, 'procedural generation')).toBe(
      'scattered',
    );
  });
});

describe('department queries', () => {
  const inDept = (number: string, name: string, open: boolean) =>
    course({
      id: `CS-${number}`,
      number,
      name,
      lectures: [
        {
          section: { crn: Number(number), seatsAvailable: open ? 5 : 0 },
          compatibleDiscussions: [],
          compatibleLabs: [],
        },
      ],
    } as unknown as Partial<Course>);

  it('lists a department by number, whatever the seats or name length', () => {
    const list = [
      inDept('2223', 'Algorithms', true),
      inDept('1101', 'Introduction To Program Design', false),
      inDept('1005', 'Programming for Engineers', true),
      inDept('1004', 'Introduction To Programming For Non-Majors', false),
      inDept('502', 'Graduate Seminar', true),
    ];
    for (const q of ['CS', 'computer science']) {
      expect(search.rank([...list], q).map(c => c.number)).toEqual([
        '1004',
        '1005',
        '1101',
        '2223',
        '502',
      ]);
    }
  });
});

describe('a department and one digit', () => {
  const cs = (number: string, name: string) =>
    course({ id: `CS-${number}`, number, name });
  const list = [
    cs('2102', 'Object-Oriented Design Concepts'),
    cs('4432', 'Database Systems II'),
    cs('2223', 'Algorithms'),
    course({
      id: 'MA-1022',
      departmentAbbr: 'MA',
      departmentName: 'Mathematical Sciences',
      number: '1022',
      name: 'Calculus II',
    }),
  ];

  it('reads "CS2" and "CS 2" as every CS 2xxx', () => {
    search.rank([...list], 'warm up');
    for (const q of ['CS2', 'CS 2', 'cs-2']) {
      expect(search.parse(q).code).toEqual({ dept: 'cs', number: '2' });
      const found = list.filter(
        c => search.matchCourseWords(c, search.parse(q)).all,
      );
      expect(found.map(c => c.number).sort()).toEqual(['2102', '2223']);
    }
  });

  it('leaves a word and a digit as words when the word is no department', () => {
    search.rank([...list], 'warm up');
    expect(search.parse('calc 2')).toMatchObject({
      code: null,
      words: ['calc', '2'],
    });
    expect(search.matchCourseWords(list[3], search.parse('calc 2')).all).toBe(
      true,
    );
  });
});

describe('acronyms of whole names', () => {
  const named = (dept: string, number: string, name: string) =>
    course({
      id: `${dept}-${number}`,
      departmentAbbr: dept,
      number,
      name,
      description: 'Nothing defined here.',
    });
  const undergrad = named('CS', '3013', 'Operating Widgets');
  const graduate = named('CS', '502', 'Operating Widgets II');
  const oneOff = named('CE', '3025', 'Project Wrangling');
  const longer = named('CS', '4801', 'Operating Widgets For Engineers');
  const all = [undergrad, graduate, oneOff, longer];
  const finds = (q: string, c: Course) =>
    search.matchCourseWords(c, search.parse(q)).all;

  it('reads the initials of a subject offered under two codes', () => {
    search.rank([...all], 'warm up');
    expect(finds('OW', undergrad)).toBe(true);
    // A sequel's number is no initial.
    expect(finds('OW', graduate)).toBe(true);
    expect(search.rank([...all], 'OW').slice(0, 2)).toEqual([
      undergrad,
      graduate,
    ]);
  });

  it('ignores the initials of a one-off name, or of part of one', () => {
    search.rank([...all], 'warm up');
    expect(finds('PW', oneOff)).toBe(false);
    expect(finds('OW', longer)).toBe(false);
  });
});

describe('short forms', () => {
  it('reads "stats" and "stat" as statistics, not static or statements', () => {
    const statistics = course({ id: 'MA-2611', name: 'Applied Statistics I' });
    const statistical = course({ id: 'PH-3206', name: 'Statistical Physics' });
    const statics = course({
      id: 'ES-2501',
      name: 'Introduction To Static Systems',
    });
    const statements = course({
      id: 'ACC-2060',
      name: 'Financial Statements For Decision Making',
    });
    for (const q of ['stats', 'stat', 'Stats']) {
      const found = [statistics, statistical, statics, statements].filter(
        c => search.matchCourseWords(c, search.parse(q)).all,
      );
      expect(found).toEqual([statistics, statistical]);
    }
  });
});

describe('phrases in names', () => {
  const named = (id: string, name: string, description = '') =>
    course({ id, number: id.split('-')[1], name, description });

  it('ranks a name whose words are shortened forms with the phrase', () => {
    const list = [
      named('RBE-1001', 'Introduction To Robotics', 'Programming robots.'),
      named('ME-2312', 'Computational Solutions', 'Intro to programming.'),
      named('CS-1101', 'Introduction To Program Design', 'Programming.'),
      named('CS-1004', 'Introduction To Programming For Non-Majors'),
    ];
    const ranked = search.rank([...list], 'intro to programming');
    expect(ranked.slice(0, 2).map(c => c.id)).toEqual(['CS-1004', 'CS-1101']);
    expect(search.describeMatch(list[2], 'intro to programming')).toBe('title');
  });

  it('does not read a typo as a shortened form', () => {
    expect(
      search.matchCourseWords(
        named('RBE-502', 'Robot Control'),
        search.parse('robotcs'),
      ).all,
    ).toBe(false);
  });

  it('puts a misspelt whole name above longer names with the phrase', () => {
    const list = [
      named('MIS-3787', 'Business Applications Of Machine Learning'),
      named('ECE-4803', 'Machine Learning in Cybersecurity'),
      named('CS-4342', 'Machine Learning'),
    ];
    expect(search.rank([...list], 'machine lerning')[0].id).toBe('CS-4342');
    // Spelt right, it still leads by more.
    expect(search.score(list[2], 'machine learning')).toBeGreaterThan(
      search.score(list[2], 'machine lerning'),
    );
  });
});

describe('misspelt departments', () => {
  it('ranks the department a typo names above typos in descriptions', () => {
    const accounting = course({
      id: 'ACC-2060',
      departmentAbbr: 'ACC',
      departmentName: 'Accounting',
      number: '2060',
      name: 'Financial Statements For Decision Making',
      description: 'Reading accounting statements.',
    });
    const counting = course({
      id: 'MA-1273',
      departmentAbbr: 'MA',
      departmentName: 'Mathematical Sciences',
      number: '1273',
      name: 'Combinatorics',
      description: 'Counting and graphs.',
    });
    expect(search.rank([counting, accounting], 'acounting')[0]).toBe(
      accounting,
    );
    expect(search.describeMatch(accounting, 'acounting')).toBe('title');
  });
});

describe('long queries', () => {
  it('searches each distinct word once, in order', () => {
    expect(search.parse('design game design GAME').words).toEqual([
      'design',
      'game',
    ]);
    expect(search.parse('calculus i calculus 1').words).toEqual([
      'calculus',
      '1',
    ]);
    expect(search.parse('design game').ignored).toBeUndefined();
  });

  it(`searches the first ${MAX_QUERY_WORDS} distinct words and reports the rest`, () => {
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`);
    const parsed = search.parse([...words, ...words].join(' '));
    expect(parsed.words).toEqual(words.slice(0, MAX_QUERY_WORDS));
    expect(parsed.ignored).toEqual(words.slice(MAX_QUERY_WORDS));
    // After a code too.
    const coded = search.parse(`MA 1022 ${words.join(' ')}`);
    expect(coded.words).toHaveLength(MAX_QUERY_WORDS);
  });

  it('answers a query of thousands of words quickly', () => {
    const c = course();
    const many = Array.from({ length: 3000 }, (_, i) => `zz${i}`).join(' ');
    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      search.score(c, many);
      search.matchCourseWords(c, search.parse(many));
    }
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('still reports every word a course matches when asked', () => {
    const c = course({ name: 'Robotics', description: 'Sensors.' });
    const result = search.matchCourseWords(
      c,
      search.parse('lee robotics sensors'),
    );
    expect(result.all).toBe(false);
    expect([0, 1, 2].map(result.word)).toEqual([false, true, true]);
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
      expect(search.matchCourseWords(french, search.parse(q)).all).toBe(true);
      expect(search.score(french, q)).toBeGreaterThan(0);
    }
    expect(search.parse('Frédéric').words).toEqual(['frederic']);
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
      expect(search.parse(q).words.every(w => typeof w === 'string')).toBe(
        true,
      );
      expect(() => search.score(oop, q)).not.toThrow();
      expect(() => search.describeMatch(oop, q)).not.toThrow();
    }
    expect(search.matchCourseWords(oop, search.parse('constructor')).all).toBe(
      true,
    );
    expect(
      search.matchCourseWords(course(), search.parse('constructor')).all,
    ).toBe(false);
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

describe('a catalog that replaces another', () => {
  it('forgets departments only the old catalog had', () => {
    const dept = (abbr: string) =>
      course({
        id: `${abbr}-2001`,
        departmentAbbr: abbr,
        departmentName: abbr,
        number: '2001',
        name: 'Topics',
      });
    const old = new SearchIndex([dept('QQ')]);
    expect(old.parse('QQ2').code).toEqual({ dept: 'qq', number: '2' });

    const fresh = new SearchIndex([dept('ZZ')]);
    expect(fresh.parse('QQ2').code).toBeNull();
    expect(fresh.parse('ZZ2').code).toEqual({ dept: 'zz', number: '2' });
    // The old catalog's index, still in use until the swap, is untouched.
    expect(old.parse('QQ2').code).toEqual({ dept: 'qq', number: '2' });
  });
});
