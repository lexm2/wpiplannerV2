import { describe, it, expect, beforeEach } from 'vitest'
import { ConflictDetector } from '../../../src/core/ConflictDetector'
import { ConflictType } from '../../../src/types/schedule'
import { DayOfWeek } from '../../../src/types/types'
import { createMockSection, createMockPeriod, createMockTime } from '../../helpers/mockData'

describe('ConflictDetector', () => {
  let conflictDetector: ConflictDetector

  beforeEach(() => {
    conflictDetector = new ConflictDetector()
  })

  describe('detectConflicts', () => {
    it('should detect no conflicts for non-overlapping sections', () => {
      const section1 = createMockSection({
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
        })]
      })

      const section2 = createMockSection({
        number: 'B01', 
        periods: [createMockPeriod({
          startTime: createMockTime(11, 0),
          endTime: createMockTime(12, 50),
          days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
        })]
      })

      const conflicts = conflictDetector.detectConflicts([section1, section2])
      
      expect(conflicts).toHaveLength(0)
    })

    it('should detect time overlap conflict', () => {
      const section1 = createMockSection({
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      const section2 = createMockSection({
        number: 'B01',
        periods: [createMockPeriod({
          startTime: createMockTime(10, 0),
          endTime: createMockTime(11, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      const conflicts = conflictDetector.detectConflicts([section1, section2])
      
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].conflictType).toBe(ConflictType.TIME_OVERLAP)
      expect(conflicts[0].section1.number).toBe('A01')
      expect(conflicts[0].section2.number).toBe('B01')
    })

    it('should not detect conflicts on different days', () => {
      const section1 = createMockSection({
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      const section2 = createMockSection({
        number: 'B01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.TUESDAY])
        })]
      })

      const conflicts = conflictDetector.detectConflicts([section1, section2])
      
      expect(conflicts).toHaveLength(0)
    })

    it('should handle sections with multiple periods', () => {
      const section1 = createMockSection({
        number: 'A01',
        periods: [
          createMockPeriod({
            type: 'Lecture',
            startTime: createMockTime(9, 0),
            endTime: createMockTime(10, 50),
            days: new Set([DayOfWeek.MONDAY])
          }),
          createMockPeriod({
            type: 'Lab',
            startTime: createMockTime(14, 0),
            endTime: createMockTime(15, 50),
            days: new Set([DayOfWeek.TUESDAY])
          })
        ]
      })

      const section2 = createMockSection({
        number: 'B01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 30),
          endTime: createMockTime(11, 0),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      const conflicts = conflictDetector.detectConflicts([section1, section2])
      
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].conflictType).toBe(ConflictType.TIME_OVERLAP)
    })

    it('should detect multiple overlapping periods between same sections', () => {
      const section1 = createMockSection({
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

      const conflicts = conflictDetector.detectConflicts([section1, section2])
      
      expect(conflicts).toHaveLength(2)
      expect(conflicts.every(c => c.conflictType === ConflictType.TIME_OVERLAP)).toBe(true)
    })
  })

  describe('isValidSchedule', () => {
    it('should return true for schedule with no conflicts', () => {
      const section1 = createMockSection({
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      const section2 = createMockSection({
        periods: [createMockPeriod({
          startTime: createMockTime(11, 0),
          endTime: createMockTime(12, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      const isValid = conflictDetector.isValidSchedule([section1, section2])
      
      expect(isValid).toBe(true)
    })

    it('should return false for schedule with time overlaps', () => {
      const section1 = createMockSection({
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      const section2 = createMockSection({
        periods: [createMockPeriod({
          startTime: createMockTime(10, 0),
          endTime: createMockTime(11, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      const isValid = conflictDetector.isValidSchedule([section1, section2])
      
      expect(isValid).toBe(false)
    })

    it('should return true for empty schedule', () => {
      const isValid = conflictDetector.isValidSchedule([])
      
      expect(isValid).toBe(true)
    })

    it('should return true for single section', () => {
      const section = createMockSection({
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      const isValid = conflictDetector.isValidSchedule([section])
      
      expect(isValid).toBe(true)
    })
  })
})