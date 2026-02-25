import { describe, test, expect, beforeEach } from 'bun:test'
import { CourseFilterService } from '../../src/services/filtering/CourseFilterService'
import { SearchService } from '../../src/services/filtering/searchService'
import { CourseSelectionService } from '../../src/services/selection/CourseSelectionService'
import { ConflictDetector } from '../../src/core/scheduling/ConflictEngine'
import { AvailabilityFilter } from '../../src/core/filtering/filters/AvailabilityFilter'
import { DepartmentFilter } from '../../src/core/filtering/filters/DepartmentFilter'
import { ProfessorFilter } from '../../src/core/filtering/filters/ProfessorFilter'
import { TermFilter } from '../../src/core/filtering/filters/TermFilter'
import { DayOfWeek, Course } from '../../src/types/types'
import { AcademicTerm } from '../../src/types/schedule'
import {
  createMockCourse,
  createMockSection,
  createMockPeriod,
  createMockTime,
  createMockDepartment,
  createMockScheduleDB
} from '../helpers/mockData'

describe('AvailabilityFilter Integration', () => {
  let filterService: CourseFilterService
  let searchService: SearchService
  let courseSelectionService: CourseSelectionService
  let conflictDetector: ConflictDetector

  beforeEach(async () => {
    // Create services
    searchService = new SearchService()
    courseSelectionService = new CourseSelectionService()
    conflictDetector = new ConflictDetector()
    filterService = new CourseFilterService(searchService, () => [])

    // Initialize course selection service
    await courseSelectionService.initialize()

    // Register filters with proper dependencies
    const availabilityFilter = new AvailabilityFilter()
    filterService.registerFilter(availabilityFilter)
    filterService.registerFilter(new DepartmentFilter())
    filterService.registerFilter(new ProfessorFilter())
    filterService.registerFilter(new TermFilter())
  })

  describe('end-to-end filtering with real services', () => {
    test('should work with multiple active filters', async () => {
      const csDept = createMockDepartment({ abbreviation: 'CS', name: 'Computer Science' })
      const maDept = createMockDepartment({ abbreviation: 'MA', name: 'Mathematical Sciences' })

      // CS course with Dr. Smith, Term A
      const csPeriod = createMockPeriod({
        professor: 'Dr. Smith',
        startTime: createMockTime(9, 0),
        endTime: createMockTime(10, 50),
        days: new Set([DayOfWeek.MONDAY])
      })

      const csSection = createMockSection({
        computedTerm: AcademicTerm.A,
        periods: [csPeriod],
        seatsAvailable: 5
      })

      const csCourse: Course = {
        ...createMockCourse({
          id: 'CS-101',
          departmentAbbr: 'CS',
          departmentName: 'Computer Science'
        }),
        lectures: [{
          section: csSection,
          compatibleDiscussions: [],
          compatibleLabs: []
        }]
      }

      // MA course with Dr. Jones, Term B
      const maPeriod = createMockPeriod({
        professor: 'Dr. Jones',
        startTime: createMockTime(11, 0),
        endTime: createMockTime(12, 50),
        days: new Set([DayOfWeek.TUESDAY])
      })

      const maSection = createMockSection({
        computedTerm: AcademicTerm.B,
        periods: [maPeriod],
        seatsAvailable: 3
      })

      const maCourse: Course = {
        ...createMockCourse({
          id: 'MA-101',
          departmentAbbr: 'MA',
          departmentName: 'Mathematical Sciences'
        }),
        lectures: [{
          section: maSection,
          compatibleDiscussions: [],
          compatibleLabs: []
        }]
      }

      const courses = [csCourse, maCourse]

      // Add multiple filters
      filterService.addFilter('availability', { availableOnly: true })
      filterService.addFilter('department', { departments: ['CS'] })
      filterService.addFilter('professor', { professors: ['Dr. Smith'] })
      filterService.addFilter('term', { terms: ['A'] })

      const filteredCourses = filterService.filterCourses(courses)

      // Should only show CS course (matches all filters)
      expect(filteredCourses).toHaveLength(1)
      expect(filteredCourses[0].id).toBe('CS-101')
    })
  })

  describe('filter coordination edge cases', () => {
    test('should handle filter removal and re-addition', () => {
      const section = createMockSection({ seatsAvailable: 5 })
      const course: Course = {
        ...createMockCourse({}),
        lectures: [{
          section: section,
          compatibleDiscussions: [],
          compatibleLabs: []
        }]
      }

      // Add filter
      filterService.addFilter('availability', { availableOnly: true })
      let filtered = filterService.filterCourses([course])
      expect(filtered).toHaveLength(1)

      // Remove filter
      filterService.removeFilter('availability')
      filtered = filterService.filterCourses([course])
      expect(filtered).toHaveLength(1)

      // Re-add filter
      filterService.addFilter('availability', { availableOnly: true })
      filtered = filterService.filterCourses([course])
      expect(filtered).toHaveLength(1)
    })

    test('should handle concurrent filter modifications', async () => {
      const section = createMockSection({ seatsAvailable: 5, computedTerm: AcademicTerm.A })
      const course: Course = {
        ...createMockCourse({}),
        lectures: [{
          section: section,
          compatibleDiscussions: [],
          compatibleLabs: []
        }]
      }

      // Add multiple filters rapidly
      filterService.addFilter('availability', { availableOnly: true })
      filterService.addFilter('department', { departments: ['CS'] })
      filterService.removeFilter('department')
      filterService.addFilter('term', { terms: ['A'] })

      const filtered = filterService.filterCourses([course])
      expect(filtered).toHaveLength(1)
    })
  })
})