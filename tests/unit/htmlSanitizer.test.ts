/**
 * Category extraction from course descriptions. The marker is spelled many
 * ways in the feed, and must not match the "cati" inside ordinary words.
 */
import { describe, it, expect } from 'vitest';
import {
  extractCategory,
  stripUnits,
} from '../../scripts/converter/utils/htmlSanitizer';

describe('extractCategory', () => {
  it.each([
    ['<p>Cat. I</p><p>Intro.</p>', 1],
    ['Cat I. Intro.', 1],
    ['Cat.II<br>Intro.', 2],
    ['CAT II Intro.', 2],
    ['Units: 1/3 Category: Category I Recommended', 1],
    ['Category: Cat III', 3],
    ['Cat. IAn intensive course.', 1],
    ['Cat. IIThe course covers...', 2],
    ['(such as CS 2223) Units: 1/3 Category: II', 2],
  ])('reads %j as Cat %i', (html, category) => {
    expect(extractCategory(html).category).toBe(category);
  });

  it('ignores "cati" inside words and leaves them intact', () => {
    const html =
      'Applications of communication in education and classification.';
    const result = extractCategory(html);
    expect(result.category).toBeNull();
    expect(result.cleanedHtml).toBe(html);
  });

  it('removes the marker without eating the next word', () => {
    const { cleanedHtml } = extractCategory('Cat. IAn intensive course.');
    expect(cleanedHtml).toContain('An intensive course.');
    expect(cleanedHtml).not.toMatch(/Cat/);
  });

  it('does not strip "cati" from words elsewhere in a marked description', () => {
    const { category, cleanedHtml } = extractCategory(
      'Cat. II Applications of education.',
    );
    expect(category).toBe(2);
    expect(cleanedHtml).toContain('Applications of education.');
  });
});

describe('trailing catalog markers', () => {
  it('strips "Units: 1/3 Category: II" from the end of a description', () => {
    const { cleanedHtml } = extractCategory(
      'Recommended background: CS 4342. Units: 1/3 Category: II',
    );
    expect(stripUnits(cleanedHtml)).toBe('Recommended background: CS 4342.');
  });

  it.each([
    [
      'Design (Units: 1/3) This course explores.',
      'Design This course explores.',
    ],
    [
      'Robotics (Units: 1/3, ) This course focuses.',
      'Robotics This course focuses.',
    ],
    ['Equivalent to MA 2612). Units: 1/3.', 'Equivalent to MA 2612).'],
    ['Minds. Units 1/3', 'Minds.'],
  ])('strips the units marker from %j', (text, expected) => {
    expect(stripUnits(text)).toBe(expected);
  });

  it('leaves "Unity Hall" alone', () => {
    expect(stripUnits('Meets in Unity Hall.')).toBe('Meets in Unity Hall.');
  });
});
