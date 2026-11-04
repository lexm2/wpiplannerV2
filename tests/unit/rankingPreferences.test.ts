/**
 * normalizeRankingPreferences: persisted data never throws, one bad
 * criterion falls back alone, and the gap bounds stay ordered.
 */
import { describe, it, expect } from 'vitest';
import { normalizeRankingPreferences } from '../../src/services/scheduling/rankingPreferences';

const defaults = normalizeRankingPreferences(undefined);

describe('normalizeRankingPreferences', () => {
  it('gives the documented defaults for nothing', () => {
    expect(defaults.gaps).toEqual({ importance: 'medium', min: 0, max: 0 });
    expect(defaults.termBalance.importance).toBe('high');
    expect(defaults.earlyClasses).toEqual({
      importance: 'off',
      before: '09:00',
    });
    expect(defaults.freeDays.days).toEqual(['F']);
    expect(defaults.lunch.minutes).toBe(45);
    expect(normalizeRankingPreferences(null)).toEqual(defaults);
    expect(normalizeRankingPreferences('junk')).toEqual(defaults);
  });

  it('fills the missing fields of a partial criterion', () => {
    const prefs = normalizeRankingPreferences({
      earlyClasses: { importance: 'high' },
    });
    expect(prefs.earlyClasses).toEqual({ importance: 'high', before: '09:00' });
  });

  it('falls back for a malformed criterion only', () => {
    const prefs = normalizeRankingPreferences({
      earlyClasses: { importance: 'extreme' },
      lateClasses: { importance: 'high', after: '16:00' },
      lunch: { importance: 'low', from: '14:00', to: '11:00' },
      gaps: { importance: 'low', min: 500 },
    });
    expect(prefs.earlyClasses).toEqual(defaults.earlyClasses);
    expect(prefs.lunch).toEqual(defaults.lunch);
    expect(prefs.gaps).toEqual(defaults.gaps);
    expect(prefs.lateClasses).toEqual({ importance: 'high', after: '16:00' });
  });

  it('raises max to min when min exceeds it', () => {
    const prefs = normalizeRankingPreferences({
      gaps: { importance: 'low', min: 30, max: 10 },
    });
    expect(prefs.gaps).toEqual({ importance: 'low', min: 30, max: 30 });
  });
});
