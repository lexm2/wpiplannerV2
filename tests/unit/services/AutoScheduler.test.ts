import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AutoScheduler } from '../../../src/services/AutoScheduler'
import type { SelectedCourse } from '../../../src/types/schedule'
import type { Course, Section, DayOfWeek } from '../../../src/types/types'
import {
  createMockCourse,
  createMockSection,
  createMockPeriod,
  createMockTime,
  createMockSelectedCourse,
  createMockSelectedCourseWithLocks,
  createCoursesWithConflicts,
  createLargeCombinationSpace,
  createMockScheduleFilterService
} from '../../helpers/mockData'

describe('AutoScheduler - Complement Method', () => {
  let autoScheduler: AutoScheduler
  let mockFilterService: any

  beforeEach(() => {
    mockFilterService = createMockScheduleFilterService()
    autoScheduler = new AutoScheduler(mockFilterService)
  })

  describe('Basic Functionality Tests', () => {
    it('should handle empty courses list', () => {
      const result = autoScheduler.generateAllSchedules([], 1000)
      expect(result).toEqual([])
    })

    it('should handle all courses with complete locked selections', () => {
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

      const selectedCourse: SelectedCourse = {
        course,
        selectedLecture: lecture,
        selectedDiscussion: null,
        selectedLab: null,
        selectedSection: null,
        selectedSectionNumber: null,
        isRequired: false,
        lockedSections: new Set(['10001'])
      }

      const result = autoScheduler.generateAllSchedules([selectedCourse], 1000)

      expect(result).toHaveLength(1)
      expect(result[0]).toHaveLength(1)
      expect(result[0][0].isLocked).toBe(true)
      expect(result[0][0].combination.lecture?.crn).toBe(10001)
    })

    it('should auto-fill when no sections are selected', () => {
      const lectureA = createMockSection({
        crn: 10001,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50)
        })]
      })

      const lectureB = createMockSection({
        crn: 10002,
        number: 'B01',
        periods: [createMockPeriod({
          startTime: createMockTime(13, 0),
          endTime: createMockTime(14, 50)
        })]
      })

      const course = createMockCourse({
        id: 'CS-1101',
        lectures: [
          { section: lectureA, compatibleDiscussions: [], compatibleLabs: [] },
          { section: lectureB, compatibleDiscussions: [], compatibleLabs: [] }
        ]
      })

      const selectedCourse = createMockSelectedCourse({ course })

      const result = autoScheduler.generateAllSchedules([selectedCourse], 1000)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0]).toHaveLength(1)
      expect(result[0][0].isLocked).toBeFalsy()
    })

    it('should handle partially locked sections - lock lecture, auto-fill discussion', () => {
      const lecture = createMockSection({
        crn: 10001,
        number: 'A01',
        periods: [createMockPeriod()]
      })

      const disc1 = createMockSection({
        crn: 10101,
        number: 'A01',
        periods: [createMockPeriod({
          type: 'Discussion',
          startTime: createMockTime(11, 0),
          endTime: createMockTime(11, 50)
        })]
      })

      const disc2 = createMockSection({
        crn: 10102,
        number: 'A02',
        periods: [createMockPeriod({
          type: 'Discussion',
          startTime: createMockTime(14, 0),
          endTime: createMockTime(14, 50)
        })]
      })

      const course = createMockCourse({
        id: 'CS-1101',
        lectures: [{
          section: lecture,
          compatibleDiscussions: [disc1, disc2],
          compatibleLabs: []
        }]
      })

      const selectedCourse: SelectedCourse = {
        course,
        selectedLecture: lecture,
        selectedDiscussion: null,
        selectedLab: null,
        selectedSection: null,
        selectedSectionNumber: null,
        isRequired: false,
        lockedSections: new Set(['10001'])
      }

      const result = autoScheduler.generateAllSchedules([selectedCourse], 1000)

      expect(result.length).toBeGreaterThanOrEqual(2)
      expect(result[0][0].combination.lecture?.crn).toBe(10001)
      expect([10101, 10102]).toContain(result[0][0].combination.discussion?.crn)
    })

    it('should handle multiple courses with mixed lock states', () => {
      const course1Lecture = createMockSection({
        crn: 10001,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50)
        })]
      })

      const course1 = createMockCourse({
        id: 'CS-1101',
        lectures: [{
          section: course1Lecture,
          compatibleDiscussions: [],
          compatibleLabs: []
        }]
      })

      const course2LectureA = createMockSection({
        crn: 20001,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(13, 0),
          endTime: createMockTime(14, 50)
        })]
      })

      const course2LectureB = createMockSection({
        crn: 20002,
        number: 'B01',
        periods: [createMockPeriod({
          startTime: createMockTime(15, 0),
          endTime: createMockTime(16, 50)
        })]
      })

      const course2 = createMockCourse({
        id: 'MA-1021',
        number: '1021',
        lectures: [
          { section: course2LectureA, compatibleDiscussions: [], compatibleLabs: [] },
          { section: course2LectureB, compatibleDiscussions: [], compatibleLabs: [] }
        ]
      })

      const selected1: SelectedCourse = {
        course: course1,
        selectedLecture: course1Lecture,
        selectedDiscussion: null,
        selectedLab: null,
        selectedSection: null,
        selectedSectionNumber: null,
        isRequired: false,
        lockedSections: new Set(['10001'])
      }

      const selected2 = createMockSelectedCourse({ course: course2 })

      const result = autoScheduler.generateAllSchedules([selected1, selected2], 1000)

      expect(result.length).toBeGreaterThanOrEqual(2)
      expect(result[0]).toHaveLength(2)
      expect(result[0][0].combination.lecture?.crn).toBe(10001)
      expect([20001, 20002]).toContain(result[0][1].combination.lecture?.crn)
    })

    it('should handle standalone lab courses', () => {
      const lab1 = createMockSection({
        crn: 30001,
        number: 'L01',
        periods: [createMockPeriod({
          type: 'Lab',
          startTime: createMockTime(14, 0),
          endTime: createMockTime(16, 50)
        })]
      })

      const lab2 = createMockSection({
        crn: 30002,
        number: 'L02',
        periods: [createMockPeriod({
          type: 'Lab',
          startTime: createMockTime(18, 0),
          endTime: createMockTime(20, 50)
        })]
      })

      const course = createMockCourse({
        id: 'CS-1004',
        number: '1004',
        name: 'Programming Lab',
        lectures: undefined,
        standaloneLabs: [lab1, lab2]
      })

      const selectedCourse = createMockSelectedCourse({ course })

      const result = autoScheduler.generateAllSchedules([selectedCourse], 1000)

      expect(result.length).toBe(2)
      expect(result[0][0].combination.lecture).toBeNull()
      expect(result[0][0].combination.lab).not.toBeNull()
    })

    it('should handle courses with only lectures (no discussion/lab)', () => {
      const lecture = createMockSection({
        crn: 40001,
        number: 'A01',
        periods: [createMockPeriod()]
      })

      const course = createMockCourse({
        id: 'HU-3900',
        lectures: [{
          section: lecture,
          compatibleDiscussions: [],
          compatibleLabs: []
        }]
      })

      const selectedCourse = createMockSelectedCourse({ course })

      const result = autoScheduler.generateAllSchedules([selectedCourse], 1000)

      expect(result).toHaveLength(1)
      expect(result[0][0].combination.lecture?.crn).toBe(40001)
      expect(result[0][0].combination.discussion).toBeNull()
      expect(result[0][0].combination.lab).toBeNull()
    })
  })

  describe('Conflict Handling Tests', () => {
    it('should return locked sections as-is even if they conflict', () => {
      const { course1, course2, conflictingSection1, conflictingSection2 } = createCoursesWithConflicts()

      const selected1: SelectedCourse = {
        course: course1,
        selectedLecture: conflictingSection1,
        selectedDiscussion: null,
        selectedLab: null,
        selectedSection: null,
        selectedSectionNumber: null,
        isRequired: false,
        lockedSections: new Set([String(conflictingSection1.crn)])
      }

      const selected2: SelectedCourse = {
        course: course2,
        selectedLecture: conflictingSection2,
        selectedDiscussion: null,
        selectedLab: null,
        selectedSection: null,
        selectedSectionNumber: null,
        isRequired: false,
        lockedSections: new Set([String(conflictingSection2.crn)])
      }

      const result = autoScheduler.generateAllSchedules([selected1, selected2], 1000)

      expect(result).toHaveLength(1)
      expect(result[0]).toHaveLength(2)
      expect(result[0][0].isLocked).toBe(true)
      expect(result[0][1].isLocked).toBe(true)
    })

    it('should filter out conflicting candidates', () => {
      const lectureA = createMockSection({
        crn: 10001,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(10, 0),
          endTime: createMockTime(11, 50),
          days: new Set(['M', 'W', 'F'] as DayOfWeek[])
        })]
      })

      const lectureB = createMockSection({
        crn: 10002,
        number: 'B01',
        periods: [createMockPeriod({
          startTime: createMockTime(10, 30),
          endTime: createMockTime(12, 20),
          days: new Set(['M', 'W'] as DayOfWeek[])
        })]
      })

      const course1 = createMockCourse({
        id: 'CS-1101',
        lectures: [{ section: lectureA, compatibleDiscussions: [], compatibleLabs: [] }]
      })

      const course2 = createMockCourse({
        id: 'MA-1021',
        number: '1021',
        lectures: [{ section: lectureB, compatibleDiscussions: [], compatibleLabs: [] }]
      })

      const selected1 = createMockSelectedCourse({ course: course1 })
      const selected2 = createMockSelectedCourse({ course: course2 })

      const result = autoScheduler.generateAllSchedules([selected1, selected2], 1000)

      expect(result).toHaveLength(0)
    })

    it('should return null when no valid schedules exist', () => {
      const { course1, course2 } = createCoursesWithConflicts()

      const selected1 = createMockSelectedCourse({ course: course1 })
      const selected2 = createMockSelectedCourse({ course: course2 })

      const result = autoScheduler.generateBestSchedule(
        [selected1, selected2],
        {
          preferredTimeRange: {
            startTime: { hours: 8, minutes: 0 },
            endTime: { hours: 18, minutes: 0 }
          },
          preferredDays: new Set(),
          avoidBackToBackClasses: false
        }
      )

      expect(result).toBeNull()
    })

    it('should handle overlap map filtering correctly', () => {
      const section1 = createMockSection({
        crn: 50001,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50)
        })]
      })

      const section2 = createMockSection({
        crn: 50002,
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

      const result = autoScheduler.generateAllSchedules([selected1, selected2], 1000)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0]).toHaveLength(2)
    })
  })

  describe('Edge Case Tests', () => {
    it('should filter out sections with 0 time periods', () => {
      const validSection = createMockSection({
        crn: 60001,
        number: 'A01',
        periods: [createMockPeriod()]
      })

      const invalidSection = createMockSection({
        crn: 60002,
        number: 'B01',
        periods: []
      })

      const course = createMockCourse({
        id: 'CS-1101',
        lectures: [
          { section: validSection, compatibleDiscussions: [], compatibleLabs: [] },
          { section: invalidSection, compatibleDiscussions: [], compatibleLabs: [] }
        ]
      })

      const selectedCourse = createMockSelectedCourse({ course })

      const result = autoScheduler.generateAllSchedules([selectedCourse], 1000)

      expect(result).toHaveLength(1)
      expect(result[0][0].combination.lecture?.crn).toBe(60001)
    })

    it('should filter out sections with no days', () => {
      const validSection = createMockSection({
        crn: 70001,
        number: 'A01',
        periods: [createMockPeriod()]
      })

      const invalidSection = createMockSection({
        crn: 70002,
        number: 'B01',
        periods: [createMockPeriod({
          days: new Set()
        })]
      })

      const course = createMockCourse({
        id: 'CS-1101',
        lectures: [
          { section: validSection, compatibleDiscussions: [], compatibleLabs: [] },
          { section: invalidSection, compatibleDiscussions: [], compatibleLabs: [] }
        ]
      })

      const selectedCourse = createMockSelectedCourse({ course })

      const result = autoScheduler.generateAllSchedules([selectedCourse], 1000)

      expect(result).toHaveLength(1)
    })

    it('should handle large combination spaces', () => {
      const courses = createLargeCombinationSpace(3, 5)
      const selectedCourses = courses.map(c => createMockSelectedCourse({ course: c }))

      const consoleSpy = vi.spyOn(console, 'warn')

      const result = autoScheduler.generateAllSchedules(selectedCourses, 1000)

      expect(result.length).toBeGreaterThan(0)
      expect(result.length).toBeLessThanOrEqual(1000)
    })

    it('should warn when combination space exceeds 100K', () => {
      const courses = createLargeCombinationSpace(6, 10)
      const selectedCourses = courses.map(c => createMockSelectedCourse({ course: c }))

      const consoleSpy = vi.spyOn(console, 'warn')

      autoScheduler.generateAllSchedules(selectedCourses, 100)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('1000000 possible combinations')
      )
    })

    it('should handle timeout protection', () => {
      const courses = createLargeCombinationSpace(8, 10)
      const selectedCourses = courses.map(c => createMockSelectedCourse({ course: c }))

      const consoleSpy = vi.spyOn(console, 'warn')

      const result = autoScheduler.generateAllSchedules(selectedCourses, 10000, 100)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Timeout after')
      )
    })

    it('should handle empty locked sections Set', () => {
      const lecture = createMockSection({
        crn: 80001,
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

      const selectedCourse: SelectedCourse = {
        course,
        selectedLecture: null,
        selectedDiscussion: null,
        selectedLab: null,
        selectedSection: null,
        selectedSectionNumber: null,
        isRequired: false,
        lockedSections: new Set()
      }

      const result = autoScheduler.generateAllSchedules([selectedCourse], 1000)

      expect(result).toHaveLength(1)
    })

    it('should handle courses without lectures property', () => {
      const lab = createMockSection({
        crn: 90001,
        number: 'L01',
        periods: [createMockPeriod({ type: 'Lab' })]
      })

      const course = createMockCourse({
        id: 'PH-1110',
        lectures: undefined,
        standaloneLabs: [lab]
      })

      const selectedCourse = createMockSelectedCourse({ course })

      const result = autoScheduler.generateAllSchedules([selectedCourse], 1000)

      expect(result).toHaveLength(1)
      expect(result[0][0].combination.lab?.crn).toBe(90001)
    })
  })

  describe('Algorithm Correctness Tests', () => {
    it('should respect dynamic type detection', () => {
      const lecture = createMockSection({
        crn: 11001,
        number: 'A01',
        periods: [createMockPeriod()]
      })

      const discussion = createMockSection({
        crn: 11101,
        number: 'A01',
        periods: [createMockPeriod({
          type: 'Discussion',
          startTime: createMockTime(14, 0),
          endTime: createMockTime(14, 50)
        })]
      })

      const course = createMockCourse({
        id: 'CS-2011',
        lectures: [{
          section: lecture,
          compatibleDiscussions: [discussion],
          compatibleLabs: []
        }]
      })

      const selectedCourse = createMockSelectedCourse({ course })

      const result = autoScheduler.generateAllSchedules([selectedCourse], 1000)

      expect(result).toHaveLength(1)
      expect(result[0][0].combination.lecture?.crn).toBe(11001)
      expect(result[0][0].combination.discussion?.crn).toBe(11101)
      expect(result[0][0].combination.lab).toBeNull()
    })

    it('should generate correct Cartesian product', () => {
      const lectureA = createMockSection({
        crn: 12001,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50)
        })]
      })

      const lectureB = createMockSection({
        crn: 12002,
        number: 'B01',
        periods: [createMockPeriod({
          startTime: createMockTime(13, 0),
          endTime: createMockTime(14, 50)
        })]
      })

      const course1 = createMockCourse({
        id: 'CS-1101',
        lectures: [
          { section: lectureA, compatibleDiscussions: [], compatibleLabs: [] },
          { section: lectureB, compatibleDiscussions: [], compatibleLabs: [] }
        ]
      })

      const lectureC = createMockSection({
        crn: 13001,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(11, 0),
          endTime: createMockTime(12, 50)
        })]
      })

      const lectureD = createMockSection({
        crn: 13002,
        number: 'B01',
        periods: [createMockPeriod({
          startTime: createMockTime(15, 0),
          endTime: createMockTime(16, 50)
        })]
      })

      const course2 = createMockCourse({
        id: 'MA-1021',
        number: '1021',
        lectures: [
          { section: lectureC, compatibleDiscussions: [], compatibleLabs: [] },
          { section: lectureD, compatibleDiscussions: [], compatibleLabs: [] }
        ]
      })

      const selected1 = createMockSelectedCourse({ course: course1 })
      const selected2 = createMockSelectedCourse({ course: course2 })

      const result = autoScheduler.generateAllSchedules([selected1, selected2], 1000)

      expect(result).toHaveLength(4)
    })

    it('should integrate with schedule scoring', () => {
      const morningLecture = createMockSection({
        crn: 14001,
        number: 'A01',
        periods: [createMockPeriod({
          startTime: createMockTime(9, 0),
          endTime: createMockTime(10, 50)
        })]
      })

      const afternoonLecture = createMockSection({
        crn: 14002,
        number: 'B01',
        periods: [createMockPeriod({
          startTime: createMockTime(15, 0),
          endTime: createMockTime(16, 50)
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

      const result = autoScheduler.generateBestSchedule(
        [selectedCourse],
        {
          preferredTimeRange: {
            startTime: { hours: 8, minutes: 0 },
            endTime: { hours: 12, minutes: 0 }
          },
          preferredDays: new Set(),
          avoidBackToBackClasses: false
        }
      )

      expect(result).not.toBeNull()
      expect(result![0].combination.lecture?.crn).toBe(14001)
    })
  })
})
