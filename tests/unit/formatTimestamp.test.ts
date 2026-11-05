import { describe, it, expect } from 'vitest';
import { formatTimestamp } from '../../src/svelte/timestampState.svelte';

describe('formatTimestamp', () => {
  it('reads "Nov 4, 2026 at 6:11 PM"', () => {
    expect(formatTimestamp(new Date(2026, 10, 4, 18, 11, 12))).toBe(
      'Nov 4, 2026 at 6:11 PM',
    );
  });
});
