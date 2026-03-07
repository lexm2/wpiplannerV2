import { describe, it, expect, beforeEach } from 'bun:test'
import { BitMaskEngine, buildConflictMatrix } from '../../../src/core/scheduling/BitMaskEngine'
import { DayOfWeek, PeriodType } from '../../../src/types/types'
import { createMockSection, createMockPeriod, createMockTime } from '../../helpers/mockData'

describe('BitMaskEngine', () => {
  let engine: BitMaskEngine

  beforeEach(() => {
    engine = new BitMaskEngine()
  })

  describe('sectionsConflict / buildConflictMatrix', () => {
    it('should detect no conflicts for non-overlapping sections', () => {
      const section1 = createMockSection({
        crn: 11111,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
        })]
      })

      const section2 = createMockSection({
        crn: 22222,
        number: 'B01',
        periods: [createMockPeriod({
          startTime: createMockTime(11, 0),
          endTime: createMockTime(12, 50),
          days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
        })]
      })

      expect(engine.sectionsConflict(section1, section2)).toBe(false)
    })

    it('should detect time overlap conflict', () => {
      const section1 = createMockSection({
        crn: 12345,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      const section2 = createMockSection({
        crn: 67890,
        number: 'B01',
        periods: [createMockPeriod({
          startTime: createMockTime(10, 0),
          endTime: createMockTime(11, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      const conflictMatrix = buildConflictMatrix([section1, section2], engine)

      expect(conflictMatrix.size).toBe(2)
      expect(conflictMatrix.get(section1.crn)?.has(section2.crn)).toBe(true)
      expect(conflictMatrix.get(section2.crn)?.has(section1.crn)).toBe(true)
    })

    it('should not detect conflicts on different days', () => {
      const section1 = createMockSection({
        crn: 11111,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      const section2 = createMockSection({
        crn: 22222,
        number: 'B01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.TUESDAY])
        })]
      })

      expect(engine.sectionsConflict(section1, section2)).toBe(false)
    })

    it('should handle sections with multiple periods', () => {
      const section1 = createMockSection({
        crn: 11111,
        number: 'A01',
        periods: [
          createMockPeriod({
            type: PeriodType.LECTURE,
            startTime: createMockTime(9, 0),
            endTime: createMockTime(10, 50),
            days: new Set([DayOfWeek.MONDAY])
          }),
          createMockPeriod({
            type: PeriodType.LAB,
            startTime: createMockTime(14, 0),
            endTime: createMockTime(15, 50),
            days: new Set([DayOfWeek.TUESDAY])
          })
        ]
      })

      const section2 = createMockSection({
        crn: 22222,
        number: 'B01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 30),
          endTime: createMockTime(11, 0),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      expect(engine.sectionsConflict(section1, section2)).toBe(true)
    })

    it('should detect multiple overlapping periods between same sections', () => {
      const section1 = createMockSection({
        crn: 11111,
        number: 'A01',
        periods: [
          createMockPeriod({
            startTime: createMockTime(9, 0),
            endTime: createMockTime(10, 50),
            days: new Set([DayOfWeek.MONDAY])
          }),
          createMockPeriod({
            startTime: createMockTime(13, 0),
            endTime: createMockTime(14, 50),
            days: new Set([DayOfWeek.WEDNESDAY])
          })
        ]
      })

      const section2 = createMockSection({
        crn: 22222,
        number: 'B01',
        periods: [
          createMockPeriod({
            startTime: createMockTime(9, 30),
            endTime: createMockTime(11, 0),
            days: new Set([DayOfWeek.MONDAY])
          }),
          createMockPeriod({
            startTime: createMockTime(13, 30),
            endTime: createMockTime(15, 0),
            days: new Set([DayOfWeek.WEDNESDAY])
          })
        ]
      })

      expect(engine.sectionsConflict(section1, section2)).toBe(true)
    })
  })

  describe('isValidSchedule', () => {
    it('should return true for schedule with no conflicts', () => {
      const section1 = createMockSection({
        crn: 11111,
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      const section2 = createMockSection({
        crn: 22222,
        periods: [createMockPeriod({
          startTime: createMockTime(11, 0),
          endTime: createMockTime(12, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      expect(engine.isValidSchedule([section1, section2])).toBe(true)
    })

    it('should return false for schedule with time overlaps', () => {
      const section1 = createMockSection({
        crn: 11111,
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      const section2 = createMockSection({
        crn: 22222,
        periods: [createMockPeriod({
          startTime: createMockTime(10, 0),
          endTime: createMockTime(11, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      expect(engine.isValidSchedule([section1, section2])).toBe(false)
    })

    it('should return true for empty schedule', () => {
      expect(engine.isValidSchedule([])).toBe(true)
    })

    it('should return true for single section', () => {
      const section = createMockSection({
        crn: 11111,
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      expect(engine.isValidSchedule([section])).toBe(true)
    })
  })
})