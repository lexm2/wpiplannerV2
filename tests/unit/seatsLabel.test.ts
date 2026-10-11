/**
 * The registrar's feed reports an over-enrolled section as a negative
 * seatsAvailable (AB1531 A01 came through as -1 of 20). The course description
 * printed that verbatim - "Seats: -1/20 available" - so the label has to read
 * it as full instead.
 */
import { describe, it, expect } from 'vitest';
import { seatsLabel } from '../../src/utils/courseUtils';

describe('seatsLabel', () => {
  it('shows open seats as remaining of total', () => {
    expect(seatsLabel({ seats: 20, seatsAvailable: 5 })).toBe('5/20 available');
  });

  it('shows a section with no seats left as full', () => {
    expect(seatsLabel({ seats: 20, seatsAvailable: 0 })).toBe(
      'Full (20/20 enrolled)',
    );
  });

  it('never prints a negative count for an over-enrolled section', () => {
    const label = seatsLabel({ seats: 20, seatsAvailable: -1 });
    expect(label).not.toMatch(/-\d/);
    expect(label).toBe('Full (21/20 enrolled)');
  });
});
