import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readSheet } from '../../src/services/degree/xlsxReader';
import {
  parseAcademicProgress,
  parseCourseString,
  parseAcademicPeriod,
  parseRemaining,
  parseRequirementName,
  classifyCategory,
  isValidStudentRecord,
} from '../../src/services/degree/academicProgressParser';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '../fixtures/academic-progress-sample.xlsx');

function parseFixture() {
  const buf = readFileSync(fixturePath);
  return parseAcademicProgress(
    readSheet(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    ),
  );
}

// --- Pure helpers -----------------------------------------------------------

describe('parseCourseString', () => {
  it('parses an in-progress course', () => {
    const c = parseCourseString(
      'CS 3041 - Human-Computer Interaction (In Progress)',
      null,
      3,
      null,
    );
    expect(c).toMatchObject({
      department: 'CS',
      number: '3041',
      title: 'Human-Computer Interaction',
      isInProgress: true,
      isTransfer: false,
    });
  });

  it('parses a transfer course', () => {
    const c = parseCourseString(
      'MA 1021 - Calculus I (Transfer Credit)',
      null,
      3,
      'L',
    );
    expect(c).toMatchObject({
      department: 'MA',
      number: '1021',
      title: 'Calculus I',
      isTransfer: true,
      grade: 'L',
    });
  });

  it('handles cross-listed codes', () => {
    const c = parseCourseString(
      'CS 2022/ MA 2201 - Discrete Mathematics',
      null,
      3,
      null,
    );
    expect(c).toMatchObject({
      code: 'CS 2022/ MA 2201',
      department: 'CS',
      number: '2022',
      title: 'Discrete Mathematics',
    });
  });
});

describe('parseAcademicPeriod', () => {
  it('parses a term', () => {
    expect(parseAcademicPeriod('2025 Fall A Term')).toEqual({
      year: 2025,
      season: 'Fall',
      term: 'A',
      raw: '2025 Fall A Term',
    });
  });
  it('parses a semester-long activity with null term', () => {
    expect(parseAcademicPeriod('2025 Fall Semester')).toMatchObject({
      year: 2025,
      season: 'Fall',
      term: null,
    });
  });
  it('returns null for empty / None', () => {
    expect(parseAcademicPeriod('')).toBeNull();
    expect(parseAcademicPeriod('None')).toBeNull();
  });
});

describe('parseRemaining', () => {
  it('parses credits', () => {
    expect(parseRemaining('Minimum 35.25 Credit(s)')).toEqual({
      creditsRemaining: 35.25,
      coursesRemaining: null,
    });
  });
  it('parses courses', () => {
    expect(parseRemaining('Minimum 1 Course(s)')).toEqual({
      creditsRemaining: null,
      coursesRemaining: 1,
    });
  });
  it('returns nulls for combination / none', () => {
    expect(parseRemaining('Minimum Combination Required')).toEqual({
      creditsRemaining: null,
      coursesRemaining: null,
    });
    expect(parseRemaining('None')).toEqual({
      creditsRemaining: null,
      coursesRemaining: null,
    });
  });
});

describe('parseRequirementName & classifyCategory', () => {
  it('parses a WPI-wide requirement', () => {
    const r = parseRequirementName(
      'WPI Total Credits Required - Undergraduate - 135 Credits',
    );
    expect(r).toEqual({
      scope: 'WPI',
      name: 'Total Credits Required',
      creditsRequired: 135,
    });
    expect(
      classifyCategory(
        'WPI Total Credits Required - Undergraduate - 135 Credits',
      ),
    ).toBe('total_credits');
  });
  it('parses a major-specific requirement', () => {
    const r = parseRequirementName(
      'Computer Science - Core Requirement - Undergraduate - 36 Credits',
    );
    expect(r.scope).toBe('Computer Science');
    expect(r.name).toBe('Core Requirement');
    expect(
      classifyCategory(
        'Computer Science - Core Requirement - Undergraduate - 36 Credits',
      ),
    ).toBe('major_specific');
  });
  it('takes the lower bound of variable-credit requirements', () => {
    expect(
      parseRequirementName('WPI MQP - Undergraduate - 9 or 12 Credits')
        .creditsRequired,
    ).toBe(9);
  });
});

// --- End-to-end against the committed fixture -------------------------------

describe('parseAcademicProgress', () => {
  it('produces a valid record with the expected major/degree', () => {
    const record = parseFixture();
    expect(record.major).toBe('Computer Science');
    expect(record.degree).toBe('BS');
    expect(isValidStudentRecord(record)).toBe(true);
  });

  it('parses the Total Credits requirement totals', () => {
    const record = parseFixture();
    const total = record.requirements.find(r => r.category === 'total_credits');
    expect(total?.creditsRequired).toBe(135);
    expect(total?.creditsRemaining).toBe(35.25);
    expect(record.credits.required).toBe(135);
  });

  it('deduplicates a course and records every requirement it satisfies', () => {
    const record = parseFixture();
    // CS 1102 appears under Total Credits, Residency, and CS Core.
    const cs1102 = record.courses.filter(
      c => c.department === 'CS' && c.number === '1102',
    );
    expect(cs1102.length).toBe(1);
    expect(cs1102[0].satisfies.length).toBe(3);
  });

  it('flags transfer credit and a semester-long (null-term) activity', () => {
    const record = parseFixture();
    expect(record.courses.some(c => c.isTransfer)).toBe(true);
    expect(record.credits.transfer).toBeGreaterThan(0);
    const wpe = record.courses.find(c => c.department === 'WPE');
    expect(wpe?.period?.term).toBeNull();
  });

  it('classifies the unused-courses bucket so the UI can hide it', () => {
    const record = parseFixture();
    expect(record.requirements.some(r => r.category === 'unused')).toBe(true);
  });
});
