import { describe, it, expect } from 'bun:test'
import { createMockScheduleResult, createMockPeriod, createMockTime } from '../../helpers/mockData'
import type { Period } from '../../../src/types/types'

describe('Period Extractor Function', () => {
  const periodExtractor = (schedule: any[]) => {
    const periods: Period[] = []
    for (const result of schedule) {
      if (result.combination.lecture?.periods) {
        periods.push(...result.combination.lecture.periods)
      }
      if (result.combination.discussion?.periods) {
        periods.push(...result.combination.discussion.periods)
      }
      if (result.combination.lab?.periods) {
        periods.push(...result.combination.lab.periods)
      }
    }
    return periods
  }

  it('should extract periods from lecture only', () => {
    const schedule = [
      createMockScheduleResult({
        lecture: {
          periods: [
            createMockPeriod({ startTime: createMockTime(9, 0) }),
            createMockPeriod({ startTime: createMockTime(9, 0) })
          ]
        }
      })
    ]

    const periods = periodExtractor(schedule)
    expect(periods.length).toBe(2)
  })

  it('should extract periods from lecture + discussion + lab', () => {
    const schedule = [
      createMockScheduleResult({
        lecture: {
          periods: [createMockPeriod({ startTime: createMockTime(9, 0) })]
        },
        discussion: {
          periods: [createMockPeriod({ startTime: createMockTime(11, 0) })]
        },
        lab: {
          periods: [createMockPeriod({ startTime: createMockTime(14, 0) })]
        }
      })
    ]

    const periods = periodExtractor(schedule)
    expect(periods.length).toBe(3)
  })

  it('should extract periods from multiple courses in schedule', () => {
    const schedule = [
      createMockScheduleResult({
        course: { id: 'CS-1101' },
        lecture: {
          periods: [createMockPeriod({ startTime: createMockTime(8, 0) })]
        }
      }),
      createMockScheduleResult({
        course: { id: 'MA-1021' },
        lecture: {
          periods: [createMockPeriod({ startTime: createMockTime(10, 0) })]
        }
      })
    ]

    const periods = periodExtractor(schedule)
    expect(periods.length).toBe(2)
  })
})
