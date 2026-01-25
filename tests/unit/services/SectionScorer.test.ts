import { describe, it, expect } from 'bun:test';
import { SectionScorer } from '../../../src/services/scheduling/SectionScorer';
import { createMockSection, createMockPeriod, createMockTime } from '../../helpers/mockData';

describe('SectionScorer', () => {
  const scorer = new SectionScorer();
  const wakeUpTime = { hours: 9, minutes: 0 };

  it('should give high score to sections after wake-up time', () => {
    const section = createMockSection({
      periods: [createMockPeriod({
        startTime: createMockTime(10, 0),
        endTime: createMockTime(11, 50)
      })]
    });

    const score = scorer.scoreSection(section, wakeUpTime);
    expect(score).toBe(1000);
  });

  it('should penalize sections before wake-up time', () => {
    const section = createMockSection({
      periods: [createMockPeriod({
        startTime: createMockTime(8, 0),
        endTime: createMockTime(9, 50)
      })]
    });

    const score = scorer.scoreSection(section, wakeUpTime);
    expect(score).toBeLessThan(1000);
    expect(score).toBe(940);
  });

  it('should give max score to async sections', () => {
    const section = createMockSection({
      periods: [createMockPeriod({
        startTime: createMockTime(8, 0),
        isAsync: true
      })]
    });

    const score = scorer.scoreSection(section, wakeUpTime);
    expect(score).toBe(1000);
  });

  it('should give max score to sections with no periods', () => {
    const section = createMockSection({
      periods: []
    });

    const score = scorer.scoreSection(section, wakeUpTime);
    expect(score).toBe(1000);
  });

  it('should average scores across multiple periods', () => {
    const section = createMockSection({
      periods: [
        createMockPeriod({
          startTime: createMockTime(10, 0),
          endTime: createMockTime(11, 50)
        }),
        createMockPeriod({
          startTime: createMockTime(8, 0),
          endTime: createMockTime(9, 50)
        })
      ]
    });

    const score = scorer.scoreSection(section, wakeUpTime);
    expect(score).toBe((1000 + 940) / 2);
  });

  it('should penalize sections that start very early', () => {
    const section = createMockSection({
      periods: [createMockPeriod({
        startTime: createMockTime(7, 0),
        endTime: createMockTime(8, 50)
      })]
    });

    const score = scorer.scoreSection(section, wakeUpTime);
    expect(score).toBe(880);
  });

  it('should give perfect score for sections at exactly wake-up time', () => {
    const section = createMockSection({
      periods: [createMockPeriod({
        startTime: createMockTime(9, 0),
        endTime: createMockTime(10, 50)
      })]
    });

    const score = scorer.scoreSection(section, wakeUpTime);
    expect(score).toBe(1000);
  });

  it('should handle mixed async and sync periods', () => {
    const section = createMockSection({
      periods: [
        createMockPeriod({
          startTime: createMockTime(8, 0),
          isAsync: true
        }),
        createMockPeriod({
          startTime: createMockTime(10, 0),
          endTime: createMockTime(11, 50)
        })
      ]
    });

    const score = scorer.scoreSection(section, wakeUpTime);
    expect(score).toBe(1000);
  });
});
