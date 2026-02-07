import { describe, it, expect, beforeEach } from 'bun:test'
import { AutoScheduler } from '../../../src/services/scheduling/AutoScheduler'
import type { AutoScheduleConfig, WeeklyTimeSlot } from '../../../src/types/schedule'
import { AcademicTerm } from '../../../src/types/schedule'
import { DayOfWeek } from '../../../src/types/types'
import {
  createMockCourse,
  createMockSection,
  createMockPeriod,
  createMockTime,
  createMockSelectedCourse,
  createMockScheduleFilterService
} from '../../helpers/mockData'

describe('AutoScheduler', () => {
  let autoScheduler: AutoScheduler
  let mockFilterService: any

  beforeEach(() => {
    mockFilterService = createMockScheduleFilterService()
    autoScheduler = new AutoScheduler(mockFilterService)
  })

  describe('Basic Schedule Generation', () => {
    it('should return empty array for no courses', () => {
      const config: AutoScheduleConfig = { blockedTimes: [] }
      const result = autoScheduler.generateSchedules([], config)
      expect(result).toEqual([])
    })

    it('should generate schedules for a single course', () => {
      const lecture = createMockSection({
        crn: 10001,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50)
        })]
      })

      const course = createMockCourse({
        id: 'CS-1101',
        lectures: [{
          section: lecture,
          compatibleDiscussions: [],
          compatibleLabs: []
        }]
      })

      const selectedCourse = createMockSelectedCourse({ course })
      const config: AutoScheduleConfig = { blockedTimes: [] }

      const result = autoScheduler.generateSchedules([selectedCourse], config)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0]).toHaveLength(1)
      expect(result[0][0].combination.lecture?.crn).toBe(10001)
    })

    it('should generate single schedule via convenience method', () => {
      const lecture = createMockSection({
        crn: 10001,
        number: 'A01',
        periods: [createMockPeriod()]
      })

      const course = createMockCourse({
        id: 'CS-1101',
        lectures: [{
          section: lecture,
          compatibleDiscussions: [],
          compatibleLabs: []
        }]
      })

      const selectedCourse = createMockSelectedCourse({ course })
      const config: AutoScheduleConfig = { blockedTimes: [] }

      const result = autoScheduler.generateSchedule([selectedCourse], config)

      expect(result).not.toBeNull()
      expect(result![0].combination.lecture?.crn).toBe(10001)
    })
  })

  describe('Blocked Time Filtering', () => {
    it('should exclude sections that conflict with blocked times', () => {
      // Create two lectures - one at 9am, one at 2pm
      const morningLecture = createMockSection({
        crn: 10001,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY])
        })]
      })

      const afternoonLecture = createMockSection({
        crn: 10002,
        number: 'B01',
        periods: [createMockPeriod({
          startTime: createMockTime(14, 0),
          endTime: createMockTime(15, 50),
          days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY])
        })]
      })

      const course = createMockCourse({
        id: 'CS-1101',
        lectures: [
          { section: morningLecture, compatibleDiscussions: [], compatibleLabs: [] },
          { section: afternoonLecture, compatibleDiscussions: [], compatibleLabs: [] }
        ]
      })

      const selectedCourse = createMockSelectedCourse({ course })

      // Block 9-11am on Monday
      const blockedTime: WeeklyTimeSlot = {
        id: 'block-1',
        day: DayOfWeek.MONDAY,
        startTime: { hours: 9, minutes: 0 },
        endTime: { hours: 11, minutes: 0 },
        term: AcademicTerm.ALL
      }

      const config: AutoScheduleConfig = { blockedTimes: [blockedTime] }

      const result = autoScheduler.generateSchedules([selectedCourse], config)

      // Should only return the afternoon lecture (morning is blocked)
      expect(result.length).toBe(1)
      expect(result[0][0].combination.lecture?.crn).toBe(10002)
    })

    it('should respect term-specific blocked times', () => {
      const lecture = createMockSection({
        crn: 10001,
        number: 'A01',
        computedTerm: AcademicTerm.A,
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      const course = createMockCourse({
        id: 'CS-1101',
        lectures: [{
          section: lecture,
          compatibleDiscussions: [],
          compatibleLabs: []
        }]
      })

      const selectedCourse = createMockSelectedCourse({ course })

      // Block only in term B (section is in term A, so should NOT be blocked)
      const blockedTime: WeeklyTimeSlot = {
        id: 'block-1',
        day: DayOfWeek.MONDAY,
        startTime: { hours: 9, minutes: 0 },
        endTime: { hours: 11, minutes: 0 },
        term: AcademicTerm.B
      }

      const config: AutoScheduleConfig = { blockedTimes: [blockedTime] }

      const result = autoScheduler.generateSchedules([selectedCourse], config)

      // Section should NOT be blocked (wrong term)
      expect(result.length).toBe(1)
      expect(result[0][0].combination.lecture?.crn).toBe(10001)
    })

    it('should return empty when all sections conflict with blocked times', () => {
      const lecture = createMockSection({
        crn: 10001,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      const course = createMockCourse({
        id: 'CS-1101',
        lectures: [{
          section: lecture,
          compatibleDiscussions: [],
          compatibleLabs: []
        }]
      })

      const selectedCourse = createMockSelectedCourse({ course })

      // Block the entire time slot
      const blockedTime: WeeklyTimeSlot = {
        id: 'block-1',
        day: DayOfWeek.MONDAY,
        startTime: { hours: 8, minutes: 0 },
        endTime: { hours: 12, minutes: 0 },
        term: AcademicTerm.ALL
      }

      const config: AutoScheduleConfig = { blockedTimes: [blockedTime] }

      const result = autoScheduler.generateSchedules([selectedCourse], config)

      expect(result).toHaveLength(0)
    })
  })

  describe('Conflict Detection', () => {
    it('should filter out conflicting section combinations', () => {
      // Two sections at the same time
      const section1 = createMockSection({
        crn: 10001,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(10, 0),
          endTime: createMockTime(11, 50),
          days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
        })]
      })

      const section2 = createMockSection({
        crn: 20001,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(10, 30),
          endTime: createMockTime(12, 20),
          days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
        })]
      })

      const course1 = createMockCourse({
        id: 'CS-1101',
        lectures: [{ section: section1, compatibleDiscussions: [], compatibleLabs: [] }]
      })

      const course2 = createMockCourse({
        id: 'MA-1021',
        number: '1021',
        lectures: [{ section: section2, compatibleDiscussions: [], compatibleLabs: [] }]
      })

      const selected1 = createMockSelectedCourse({ course: course1 })
      const selected2 = createMockSelectedCourse({ course: course2 })
      const config: AutoScheduleConfig = { blockedTimes: [] }

      const result = autoScheduler.generateSchedules([selected1, selected2], config)

      // No valid schedules because sections conflict
      expect(result).toHaveLength(0)
    })

    it('should allow non-conflicting sections', () => {
      const section1 = createMockSection({
        crn: 10001,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50)
        })]
      })

      const section2 = createMockSection({
        crn: 20001,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(13, 0),
          endTime: createMockTime(14, 50)
        })]
      })

      const course1 = createMockCourse({
        id: 'CS-1101',
        lectures: [{ section: section1, compatibleDiscussions: [], compatibleLabs: [] }]
      })

      const course2 = createMockCourse({
        id: 'MA-1021',
        number: '1021',
        lectures: [{ section: section2, compatibleDiscussions: [], compatibleLabs: [] }]
      })

      const selected1 = createMockSelectedCourse({ course: course1 })
      const selected2 = createMockSelectedCourse({ course: course2 })
      const config: AutoScheduleConfig = { blockedTimes: [] }

      const result = autoScheduler.generateSchedules([selected1, selected2], config)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0]).toHaveLength(2)
    })
  })

  describe('Locked Sections', () => {
    it('should respect fully locked courses', () => {
      const lecture = createMockSection({
        crn: 10001,
        number: 'A01',
        periods: [createMockPeriod()]
      })

      const course = createMockCourse({
        id: 'CS-1101',
        lectures: [{
          section: lecture,
          compatibleDiscussions: [],
          compatibleLabs: []
        }]
      })

      const selectedCourse = {
        course,
        selectedLecture: lecture,
        selectedDiscussion: null,
        selectedLab: null,
        isRequired: false,
        lockedSections: new Set<string>(['10001'])
      }

      const config: AutoScheduleConfig = { blockedTimes: [] }

      const result = autoScheduler.generateSchedules([selectedCourse], config)

      expect(result).toHaveLength(1)
      expect(result[0][0].isLocked).toBe(true)
      expect(result[0][0].combination.lecture?.crn).toBe(10001)
    })
  })

  describe('Fall and Spring Term Blocked Times', () => {
    it('should block Fall (F) sections when term A is blocked', () => {
      const fallSection = createMockSection({
        crn: 30001,
        number: 'F01',
        computedTerm: AcademicTerm.F,
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50),
          days: new Set([DayOfWeek.MONDAY])
        })]
      })

      const course = createMockCourse({
        id: 'CS-5001',
        lectures: [{ section: fallSection, compatibleDiscussions: [], compatibleLabs: [] }]
      })

      const selectedCourse = {
        course,
        selectedLecture: null,
        selectedDiscussion: null,
        selectedLab: null,
        isRequired: false,
        lockedSections: new Set<string>()
      }

      const blockedTime: WeeklyTimeSlot = {
        id: 'block-1',
        day: DayOfWeek.MONDAY,
        startTime: { hours: 9, minutes: 0 },
        endTime: { hours: 10, minutes: 50 },
        term: AcademicTerm.A
      }

      const config: AutoScheduleConfig = { blockedTimes: [blockedTime] }
      const result = autoScheduler.generateSchedules([selectedCourse], config)

      expect(result).toHaveLength(0)
    })

    it('should block Spring (S) sections when term C is blocked', () => {
      const springSection = createMockSection({
        crn: 40001,
        number: 'S01',
        computedTerm: AcademicTerm.S,
        periods: [createMockPeriod({
          startTime: createMockTime(14, 0),
          endTime: createMockTime(15, 50),
          days: new Set([DayOfWeek.TUESDAY])
        })]
      })

      const course = createMockCourse({
        id: 'CS-5002',
        lectures: [{ section: springSection, compatibleDiscussions: [], compatibleLabs: [] }]
      })

      const selectedCourse = {
        course,
        selectedLecture: null,
        selectedDiscussion: null,
        selectedLab: null,
        isRequired: false,
        lockedSections: new Set<string>()
      }

      const blockedTime: WeeklyTimeSlot = {
        id: 'block-2',
        day: DayOfWeek.TUESDAY,
        startTime: { hours: 14, minutes: 0 },
        endTime: { hours: 15, minutes: 50 },
        term: AcademicTerm.C
      }

      const config: AutoScheduleConfig = { blockedTimes: [blockedTime] }
      const result = autoScheduler.generateSchedules([selectedCourse], config)

      expect(result).toHaveLength(0)
    })

    it('should allow Fall sections when blocking with F term expands to A and B', () => {
      const fallSection = createMockSection({
        crn: 50001,
        number: 'F01',
        computedTerm: AcademicTerm.F,
        periods: [createMockPeriod({
          startTime: createMockTime(11, 0),
          endTime: createMockTime(12, 50),
          days: new Set([DayOfWeek.WEDNESDAY])
        })]
      })

      const course = createMockCourse({
        id: 'CS-5003',
        lectures: [{ section: fallSection, compatibleDiscussions: [], compatibleLabs: [] }]
      })

      const selectedCourse = {
        course,
        selectedLecture: null,
        selectedDiscussion: null,
        selectedLab: null,
        isRequired: false,
        lockedSections: new Set<string>()
      }

      const blockedTime: WeeklyTimeSlot = {
        id: 'block-3',
        day: DayOfWeek.WEDNESDAY,
        startTime: { hours: 11, minutes: 0 },
        endTime: { hours: 12, minutes: 50 },
        term: AcademicTerm.F
      }

      const config: AutoScheduleConfig = { blockedTimes: [blockedTime] }
      const result = autoScheduler.generateSchedules([selectedCourse], config)

      expect(result).toHaveLength(0)
    })
  })
})
