/**
 * Prerequisite statements lifted from description prose. Inputs are real
 * catalog descriptions, trimmed.
 */
import { describe, it, expect } from 'vitest';
import { extractPrerequisites } from '../../scripts/converter/utils/prerequisites';

describe('extractPrerequisites', () => {
  it('takes a recommended background to the end of the description', () => {
    expect(
      extractPrerequisites(
        'Design of algorithms. Recommended background: CS 2102 or CS 2103, and CS 2022.',
      ),
    ).toEqual({ recommendedBackground: 'CS 2102 or CS 2103, and CS 2022.' });
  });

  it.each([
    'Suggested background: MA 1022.',
    'Required Background: MA 1022.',
    'Recommended Background - MA 1022.',
    'Recommended background : MA 1022.',
  ])('reads the %j spelling', text => {
    expect(extractPrerequisites(text).recommendedBackground).toBe('MA 1022.');
  });

  it('stops at a sentence that starts something else', () => {
    expect(
      extractPrerequisites(
        'Recommended Background: high school biology. Students may not receive credit for both BB 1004 and BB 1025.',
      ),
    ).toEqual({ recommendedBackground: 'high school biology.' });
  });

  it('keeps a background that runs over several sentences', () => {
    expect(
      extractPrerequisites(
        'Recommended background: High school biology. Programming experience is not required.',
      ).recommendedBackground,
    ).toBe('High school biology. Programming experience is not required.');
  });

  it('reads a prerequisite written in parentheses', () => {
    expect(
      extractPrerequisites(
        'Computation theory. (Prerequisites: CS 503, or equivalent background in basic models of computation.) Note: Students cannot receive credit for both.',
      ),
    ).toEqual({
      prerequisites:
        'CS 503, or equivalent background in basic models of computation.',
    });
  });

  it('separates a prerequisite from a background in the same description', () => {
    expect(
      extractPrerequisites(
        'Prerequisite: graduate standing. Recommended background: MA 2071.',
      ),
    ).toEqual({
      prerequisites: 'graduate standing.',
      recommendedBackground: 'MA 2071.',
    });
  });

  it('returns nothing for a description without either', () => {
    expect(extractPrerequisites('An introduction to calculus.')).toEqual({});
  });
});
