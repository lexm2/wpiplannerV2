import { describe, test, expect, beforeEach } from 'vitest'
import { FilterService } from '../../src/services/FilterService'
import { SearchService } from '../../src/services/searchService'
import { CourseSelectionService } from '../../src/services/CourseSelectionService'
import { ConflictDetector } from '../../src/core/ConflictDetector'
import { AvailabilityFilter } from '../../src/core/filters/AvailabilityFilter'
import { DepartmentFilter } from '../../src/core/filters/DepartmentFilter'
import { ProfessorFilter } from '../../src/core/filters/ProfessorFilter'
import { TermFilter } from '../../src/core/filters/TermFilter'
import { DayOfWeek } from '../../src/types/types'
import { 
  createMockCourse, 
  createMockSection, 
  createMockPeriod, 
  createMockTime, 
  createMockDepartment,
  createMockScheduleDB
} from '../helpers/mockData'

describe('AvailabilityFilter Integration', () => {
  let filterService: FilterService
  let searchService: SearchService
  let courseSelectionService: CourseSelectionService
  let conflictDetector: ConflictDetector

  beforeEach(async () => {
    // Create services
    searchService = new SearchService()
    courseSelectionService = new CourseSelectionService()
    conflictDetector = new ConflictDetector()
    filterService = new FilterService(searchService, courseSelectionService)

    // Initialize course selection service
    await courseSelectionService.initialize()

    // Register filters with proper dependencies
    const availabilityFilter = new AvailabilityFilter(conflictDetector)
    filterService.registerFilter(availabilityFilter)
    filterService.registerFilter(new DepartmentFilter())
    filterService.registerFilter(new ProfessorFilter())
    filterService.registerFilter(new TermFilter())
  })

  describe('end-to-end filtering with real services', () => {
    test('should integrate with FilterService and CourseSelectionService', async () => {
      // Create test courses with conflicting schedules
      const period1 = createMockPeriod({
        startTime: createMockTime(9, 0),
        endTime: createMockTime(10, 50),
        days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
      })

      const period2 = createMockPeriod({
        startTime: createMockTime(9, 30),
        endTime: createMockTime(11, 0),
        days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
      })

      const period3 = createMockPeriod({
        startTime: createMockTime(14, 0),
        endTime: createMockTime(15, 50),
        days: new Set([DayOfWeek.TUESDAY, DayOfWeek.THURSDAY])
      })

      const course1 = createMockCourse({
        id: 'CS-101',
        number: '101',
        name: 'Intro to Programming',
        sections: [createMockSection({ 
          number: 'A01',
          periods: [period1], 
          seatsAvailable: 5 
        })]
      })

      const course2 = createMockCourse({
        id: 'CS-102', 
        number: '102',
        name: 'Data Structures',
        sections: [createMockSection({ 
          number: 'B01',
          periods: [period2], 
          seatsAvailable: 3 
        })]
      })

      const course3 = createMockCourse({
        id: 'CS-201',
        number: '201', 
        name: 'Algorithms',
        sections: [createMockSection({ 
          number: 'C01',
          periods: [period3], 
          seatsAvailable: 4 
        })]
      })

      const courses = [course1, course2, course3]

      // Select the first course
      await courseSelectionService.selectCourse(course1)
      await courseSelectionService.setSelectedSection('CS-101', 'A01')

      // Add availability filter
      const success = filterService.addFilter('availability', { availableOnly: true })
      expect(success).toBe(true)

      // Apply filters
      const filteredCourses = filterService.filterCourses(courses)

      // Should include course1 (selected) and course3 (no conflict), exclude course2 (conflict)
      expect(filteredCourses).toHaveLength(2)
      expect(filteredCourses.find(c => c.id === 'CS-101')).toBeDefined()
      expect(filteredCourses.find(c => c.id === 'CS-201')).toBeDefined()
      expect(filteredCourses.find(c => c.id === 'CS-102')).toBeUndefined()
    })

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

      const csCourse = createMockCourse({
        id: 'CS-101',
        department: csDept,
        sections: [createMockSection({ 
          computedTerm: 'A',
          periods: [csPeriod], 
          seatsAvailable: 5 
        })]
      })

      // MA course with Dr. Jones, Term B
      const maPeriod = createMockPeriod({
        professor: 'Dr. Jones',
        startTime: createMockTime(11, 0),
        endTime: createMockTime(12, 50),
        days: new Set([DayOfWeek.TUESDAY])
      })

      const maCourse = createMockCourse({
        id: 'MA-101',
        department: maDept,
        sections: [createMockSection({ 
          computedTerm: 'B',
          periods: [maPeriod], 
          seatsAvailable: 3 
        })]
      })

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

    test('should handle complex schedule conflicts with multiple selected courses', async () => {
      // Create three courses with various conflict patterns
      const course1Period = createMockPeriod({
        startTime: createMockTime(9, 0),
        endTime: createMockTime(10, 50),
        days: new Set([DayOfWeek.MONDAY])
      })

      const course2Period = createMockPeriod({
        startTime: createMockTime(14, 0),
        endTime: createMockTime(15, 50),
        days: new Set([DayOfWeek.WEDNESDAY])
      })

      const testCourse1Period = createMockPeriod({
        startTime: createMockTime(9, 30), // Conflicts with course1
        endTime: createMockTime(11, 0),
        days: new Set([DayOfWeek.MONDAY])
      })

      const testCourse2Period = createMockPeriod({
        startTime: createMockTime(14, 30), // Conflicts with course2
        endTime: createMockTime(16, 0),
        days: new Set([DayOfWeek.WEDNESDAY])
      })

      const testCourse3Period = createMockPeriod({
        startTime: createMockTime(11, 0), // No conflicts
        endTime: createMockTime(12, 50),
        days: new Set([DayOfWeek.FRIDAY])
      })

      const selectedCourse1 = createMockCourse({
        id: 'SELECTED-1',
        sections: [createMockSection({ periods: [course1Period], seatsAvailable: 5 })]
      })

      const selectedCourse2 = createMockCourse({
        id: 'SELECTED-2',
        sections: [createMockSection({ periods: [course2Period], seatsAvailable: 5 })]
      })

      const testCourse1 = createMockCourse({
        id: 'TEST-1',
        sections: [createMockSection({ periods: [testCourse1Period], seatsAvailable: 3 })]
      })

      const testCourse2 = createMockCourse({
        id: 'TEST-2',
        sections: [createMockSection({ periods: [testCourse2Period], seatsAvailable: 4 })]
      })

      const testCourse3 = createMockCourse({
        id: 'TEST-3',
        sections: [createMockSection({ periods: [testCourse3Period], seatsAvailable: 2 })]
      })

      // Select two courses
      await courseSelectionService.selectCourse(selectedCourse1)
      await courseSelectionService.setSelectedSection('SELECTED-1', 'A01')
      
      await courseSelectionService.selectCourse(selectedCourse2)
      await courseSelectionService.setSelectedSection('SELECTED-2', 'A01')

      // Add availability filter
      filterService.addFilter('availability', { availableOnly: true })

      const testCourses = [testCourse1, testCourse2, testCourse3]
      const filteredCourses = filterService.filterCourses(testCourses)

      // Only testCourse3 should pass (no conflicts)
      expect(filteredCourses).toHaveLength(1)
      expect(filteredCourses[0].id).toBe('TEST-3')
    })

    test('should maintain performance with large datasets', async () => {
      // Create a large number of courses
      const courses = []
      for (let i = 0; i < 100; i++) {
        const period = createMockPeriod({
          startTime: createMockTime(9 + (i % 8), 0),
          endTime: createMockTime(10 + (i % 8), 50),
          days: new Set([DayOfWeek.MONDAY])
        })

        courses.push(createMockCourse({
          id: `COURSE-${i}`,
          number: i.toString(),
          sections: [createMockSection({ periods: [period], seatsAvailable: Math.max(1, i % 10) })]
        }))
      }

      // Select one course to create conflicts
      await courseSelectionService.selectCourse(courses[0])
      await courseSelectionService.setSelectedSection('COURSE-0', 'A01')

      filterService.addFilter('availability', { availableOnly: true })

      const startTime = performance.now()
      const filteredCourses = filterService.filterCourses(courses)
      const endTime = performance.now()

      // Should complete within reasonable time (< 100ms)
      expect(endTime - startTime).toBeLessThan(100)
      
      // Should filter out courses with conflicts and no availability
      expect(filteredCourses.length).toBeGreaterThan(0)
      expect(filteredCourses.length).toBeLessThan(courses.length)
    })
  })

  describe('filter coordination edge cases', () => {
    test('should handle filter removal and re-addition', () => {
      const course = createMockCourse({
        sections: [createMockSection({ seatsAvailable: 5 })]
      })

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
      const course = createMockCourse({
        sections: [createMockSection({ seatsAvailable: 5 })]
      })

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