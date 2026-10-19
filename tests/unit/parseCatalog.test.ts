/**
 * parseCatalog: the pure catalog parse shared by the web app and the course
 * API server.
 */
import { describe, it, expect } from 'vitest';
import { parseCatalog } from '../../src/services/data/parseCatalog';
import { DayOfWeek, PeriodType } from '../../src/types/types';

const lecture = {
  section: {
    crn: 101,
    number: 'AL01',
    computedTerm: 'A',
    periods: [
      {
        type: 'Lecture',
        professor: 'Ada Lovelace',
        startTime: '13:00',
        endTime: '13:50',
        days: ['M', 'r'],
      },
    ],
  },
  compatibleDiscussions: [
    {
      crn: 102,
      number: 'AD01',
      computedTerm: 'A',
      periods: [{ type: 'Discussion', startTime: 'TBA', endTime: 'TBA' }],
    },
  ],
};

describe('parseCatalog', () => {
  it('parses departments, sections, times and days', () => {
    const db = parseCatalog({
      generated: '2026-01-01T00:00:00Z',
      departments: [
        {
          abbreviation: 'CS',
          name: 'Computer Science',
          courses: [
            {
              id: 'CS-1101-2026',
              number: '1101',
              name: 'Intro',
              description: '<p>Loops &amp; recursion &#8211; R&D</p>',
              academicYear: 2026,
              lectures: [lecture],
            },
          ],
        },
      ],
    });

    expect(db.generated).toBe('2026-01-01T00:00:00Z');
    const course = db.departments[0].courses[0];
    expect(course.departmentAbbr).toBe('CS');
    expect(course.description).toBe('Loops & recursion – R&D');
    expect(course.minCredits).toBe(0);

    const period = course.lectures![0].section.periods[0];
    expect(period.type).toBe(PeriodType.LECTURE);
    expect(period.startTime).toEqual({
      hours: 13,
      minutes: 0,
      displayTime: '1:00 PM',
    });
    expect([...period.days]).toEqual([DayOfWeek.MONDAY, DayOfWeek.THURSDAY]);

    const discussion = course.lectures![0].compatibleDiscussions[0];
    expect(discussion.periods[0].type).toBe(PeriodType.DISCUSSION);
    expect(discussion.periods[0].startTime.displayTime).toBe('TBD');
  });

  it('rejects data without a departments array', () => {
    expect(() => parseCatalog({ generated: 'x' })).toThrow(
      'missing departments array',
    );
    expect(() => parseCatalog('nope')).toThrow();
  });

  it('carries the catalog fields, with defaults for older data', () => {
    const db = parseCatalog({
      departments: [
        {
          abbreviation: 'DS',
          name: 'Data Science',
          courses: [
            {
              id: 'DS-502-2026',
              number: '502',
              name: 'Statistical Methods',
              degreeAttributes: ['Social Sciences'],
              courseTypes: ['Special Topic'],
              crossListedWith: ['MA 543'],
              recommendedBackground: 'MA 2611.',
              prerequisites: 'graduate standing.',
              lectures: [
                {
                  section: {
                    ...lecture.section,
                    isOnlineGrad: true,
                    meetsWith: ['MA 543-F01'],
                    deliveryMode: 'Online',
                    status: 'Waitlist',
                    startDate: '2026-08-27',
                    endDate: '2026-12-10',
                  },
                },
              ],
            },
            {
              id: 'DS-501-2026',
              number: '501',
              name: 'Old',
              lectures: [lecture],
            },
          ],
        },
      ],
    });

    const [current, older] = db.departments[0].courses;
    expect(current).toMatchObject({
      degreeAttributes: ['Social Sciences'],
      courseTypes: ['Special Topic'],
      crossListedWith: ['MA 543'],
      recommendedBackground: 'MA 2611.',
      prerequisites: 'graduate standing.',
    });
    expect(current.lectures![0].section).toMatchObject({
      isOnlineGrad: true,
      meetsWith: ['MA 543-F01'],
      deliveryMode: 'Online',
      status: 'Waitlist',
      startDate: '2026-08-27',
      endDate: '2026-12-10',
    });

    expect(older).toMatchObject({
      degreeAttributes: [],
      courseTypes: [],
      crossListedWith: [],
    });
    expect(older.recommendedBackground).toBeUndefined();
    expect(older.lectures![0].section).toMatchObject({
      isOnlineGrad: false,
      meetsWith: [],
      deliveryMode: '',
      status: '',
    });
  });
});
