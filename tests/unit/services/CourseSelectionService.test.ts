import { describe, it, expect, beforeEach, vi, afterEach, mock, spyOn } from 'bun:test'
import { CourseSelectionService } from '../../../src/services/selection/CourseSelectionService'
import { ProfileStateManager } from '../../../src/core/state/ProfileStateManager'
import { DataValidator } from '../../../src/core/validation/DataValidator'
import { Course } from '../../../src/types/types'
import { mockLocalStorage } from '../../helpers/testUtils'
import { createMockCourse, createMockSection, createMockDepartment } from '../../helpers/mockData'
import { AcademicTerm } from '../../../src/types/schedule'

describe('CourseSelectionService', () => {
  let courseSelectionService: CourseSelectionService
  let mockProfileStateManager: ProfileStateManager
  let mockDataValidator: DataValidator
  let mockStorage: any
  let consoleSpy: any

  const mockCourse: Course = createMockCourse({
    id: 'CS-101',
    number: '101',
    name: 'Introduction to Computer Science',
    description: 'Basic CS course',
    lectures: [
      {
        section: createMockSection({
          crn: 12345,
          number: 'A01',
          description: 'Fall 2024 section',
          term: 'Fall 2024',
          computedTerm: AcademicTerm.A,
          periods: []
        }),
        compatibleDiscussions: [],
        compatibleLabs: []
      },
      {
        section: createMockSection({
          crn: 12346,
          number: 'A02',
          description: 'Fall 2024 section',
          term: 'Fall 2024',
          computedTerm: AcademicTerm.A,
          periods: []
        }),
        compatibleDiscussions: [],
        compatibleLabs: []
      }
    ]
  })

  const mockCourse2: Course = createMockCourse({
    id: 'MATH-101',
    number: '101',
    name: 'Calculus I',
    description: 'Introduction to calculus',
    minCredits: 4,
    maxCredits: 4,
    department: createMockDepartment({ abbreviation: 'MATH', name: 'Mathematics' }),
    lectures: [
      {
        section: createMockSection({
          crn: 22345,
          number: 'B01',
          description: 'Fall 2024 section',
          term: 'Fall 2024',
          computedTerm: AcademicTerm.B,
          periods: []
        }),
        compatibleDiscussions: [],
        compatibleLabs: []
      }
    ]
  })

  beforeEach(() => {
    mockStorage = mockLocalStorage()
    consoleSpy = spyOn(console, 'warn').mockImplementation(() => {})

    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true
    })

    ProfileStateManager.resetInstance()
    mockProfileStateManager = ProfileStateManager.getInstance()
    mockDataValidator = new DataValidator()

    courseSelectionService = new CourseSelectionService(
      mockProfileStateManager,
      mockDataValidator
    )
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const result = await courseSelectionService.initialize()
      expect(result).toBe(true)
    })

  })

  describe('Course Selection', () => {
    beforeEach(async () => {
      await courseSelectionService.initialize()
    })

    it('should select course successfully', async () => {
      const result = await courseSelectionService.selectCourse(mockCourse)
      
      expect(result.success).toBe(true)
      expect(result.course).toBeTruthy()
      expect(result.course?.course).toEqual(mockCourse)
      expect(result.course?.isRequired).toBe(false)

      expect(courseSelectionService.isCourseSelected(mockCourse)).toBe(true)
      expect(courseSelectionService.getSelectedCoursesCount()).toBe(1)
    })

    it('should select course as required', async () => {
      const result = await courseSelectionService.selectCourse(mockCourse, { isRequired: true })
      
      expect(result.success).toBe(true)
      expect(result.course?.isRequired).toBe(true)
    })


    it('should unselect course successfully', async () => {
      // First select the course
      await courseSelectionService.selectCourse(mockCourse)
      expect(courseSelectionService.isCourseSelected(mockCourse)).toBe(true)

      // Then unselect it
      const result = await courseSelectionService.unselectCourse(mockCourse)
      
      expect(result.success).toBe(true)
      expect(courseSelectionService.isCourseSelected(mockCourse)).toBe(false)
      expect(courseSelectionService.getSelectedCoursesCount()).toBe(0)
    })

    it('should handle unselecting non-selected course', async () => {
      const result = await courseSelectionService.unselectCourse(mockCourse)
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('not currently selected')
    })

    it('should toggle course selection', async () => {
      expect(courseSelectionService.isCourseSelected(mockCourse)).toBe(false)

      // Toggle to select
      let result = await courseSelectionService.toggleCourseSelection(mockCourse)
      expect(result.success).toBe(true)
      expect(courseSelectionService.isCourseSelected(mockCourse)).toBe(true)

      // Toggle to unselect
      result = await courseSelectionService.toggleCourseSelection(mockCourse)
      expect(result.success).toBe(true)
      expect(courseSelectionService.isCourseSelected(mockCourse)).toBe(false)
    })

    it('should clear all selections', async () => {
      // Select multiple courses
      await courseSelectionService.selectCourse(mockCourse)
      await courseSelectionService.selectCourse(mockCourse2)
      expect(courseSelectionService.getSelectedCoursesCount()).toBe(2)

      // Clear all
      const result = await courseSelectionService.clearAllSelections()
      expect(result.success).toBe(true)
      expect(courseSelectionService.getSelectedCoursesCount()).toBe(0)
    })
  })

  describe('Section Selection', () => {
    beforeEach(async () => {
      await courseSelectionService.initialize()
      await courseSelectionService.selectCourse(mockCourse)
    })

    it('should set selected section successfully', async () => {
      const result = await courseSelectionService.setSelectedSection(mockCourse, 'A01')

      expect(result.success).toBe(true)
      expect(result.course?.selectedLecture).toBeTruthy()
      expect(result.course?.selectedLecture?.number).toBe('A01')

      const selectedCourse = courseSelectionService.getSelectedCourse(mockCourse)
      expect(selectedCourse?.selectedLecture?.number).toBe('A01')
    })

    it('should clear selected section', async () => {
      // First set a section
      await courseSelectionService.setSelectedSection(mockCourse, 'A01')
      let selectedCourse = courseSelectionService.getSelectedCourse(mockCourse)
      expect(selectedCourse?.selectedLecture?.number).toBe('A01')

      // Then clear it
      const result = await courseSelectionService.setSelectedSection(mockCourse, null)
      expect(result.success).toBe(true)

      selectedCourse = courseSelectionService.getSelectedCourse(mockCourse)
      expect(selectedCourse?.selectedLecture).toBeNull()
    })

    it('should validate section exists in course', async () => {
      const result = await courseSelectionService.setSelectedSection(mockCourse, 'INVALID')

      expect(result.success).toBe(true)
      expect(result.course?.selectedLecture).toBeNull()
    })

    it('should require course to be selected first', async () => {
      const result = await courseSelectionService.setSelectedSection(mockCourse2, 'B01')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('must be selected before')
    })

    it('should get selected section object', async () => {
      await courseSelectionService.setSelectedSection(mockCourse, 'A01')

      const selectedCourse = courseSelectionService.getSelectedCourse(mockCourse)
      expect(selectedCourse?.selectedLecture).toBeTruthy()
      expect(selectedCourse?.selectedLecture?.number).toBe('A01')
      expect(selectedCourse?.selectedLecture?.crn).toBe(12345)
    })
  })

  describe('Data Queries', () => {
    beforeEach(async () => {
      await courseSelectionService.initialize()
    })

    it('should return correct course selection status', async () => {
      expect(courseSelectionService.isCourseSelected(mockCourse)).toBe(false)
      
      await courseSelectionService.selectCourse(mockCourse)
      expect(courseSelectionService.isCourseSelected(mockCourse)).toBe(true)
    })

    it('should get selected course details', async () => {
      await courseSelectionService.selectCourse(mockCourse, { isRequired: true })
      
      const selectedCourse = courseSelectionService.getSelectedCourse(mockCourse)
      expect(selectedCourse).toBeTruthy()
      expect(selectedCourse?.course).toEqual(mockCourse)
      expect(selectedCourse?.isRequired).toBe(true)
    })

    it('should get all selected courses', async () => {
      await courseSelectionService.selectCourse(mockCourse)
      await courseSelectionService.selectCourse(mockCourse2, { isRequired: true })
      
      const selectedCourses = courseSelectionService.getSelectedCourses()
      expect(selectedCourses).toHaveLength(2)
      expect(selectedCourses.find(sc => sc.course.id === mockCourse.id)).toBeTruthy()
      expect(selectedCourses.find(sc => sc.course.id === mockCourse2.id)).toBeTruthy()
    })

    it('should get selected course IDs', async () => {
      await courseSelectionService.selectCourse(mockCourse)
      await courseSelectionService.selectCourse(mockCourse2)
      
      const courseIds = courseSelectionService.getSelectedCourseIds()
      expect(courseIds).toContain('CS-101')
      expect(courseIds).toContain('MATH-101')
    })
  })

  describe('Event Handling', () => {
    beforeEach(async () => {
      await courseSelectionService.initialize()
    })

    it('should notify listeners of course selection changes', async () => {
      const events: any[] = []
      const listener = (event: any) => events.push(event)
      
      courseSelectionService.addSelectionListener(listener)
      
      // Select course
      await courseSelectionService.selectCourse(mockCourse)
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('course_added')
      expect(events[0].course).toEqual(mockCourse)

      // Unselect course
      await courseSelectionService.unselectCourse(mockCourse)
      expect(events).toHaveLength(2)
      expect(events[1].type).toBe('course_removed')
    })

    it('should notify listeners of section changes', async () => {
      const events: any[] = []
      const listener = (event: any) => events.push(event)
      
      await courseSelectionService.selectCourse(mockCourse)
      courseSelectionService.addSelectionListener(listener)
      
      await courseSelectionService.setSelectedSection(mockCourse, 'A01')
      
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('section_changed')
      expect(events[0].section).toBe('A01')
    })

    it('should handle listener errors gracefully', async () => {
      const errorListener = () => { throw new Error('Listener error') }
      const normalListener = mock()
      const originalConsoleError = console.error
      console.error = mock()

      courseSelectionService.addSelectionListener(errorListener)
      courseSelectionService.addSelectionListener(normalListener)

      // Should succeed despite error in first listener
      const result = await courseSelectionService.selectCourse(mockCourse)
      expect(result.success).toBe(true)

      expect(normalListener).toHaveBeenCalled()
      expect(console.error).toHaveBeenCalledWith('Error in selection change listener:', expect.anything())

      console.error = originalConsoleError
    })

    it('should remove listeners correctly', async () => {
      const listener1 = mock()
      const listener2 = mock()
      
      courseSelectionService.addSelectionListener(listener1)
      courseSelectionService.addSelectionListener(listener2)
      
      await courseSelectionService.selectCourse(mockCourse)
      expect(listener1).toHaveBeenCalledTimes(1)
      expect(listener2).toHaveBeenCalledTimes(1)
      
      // Remove one listener
      courseSelectionService.removeSelectionListener(listener1)
      
      await courseSelectionService.selectCourse(mockCourse2)
      expect(listener1).toHaveBeenCalledTimes(1) // Should not change
      expect(listener2).toHaveBeenCalledTimes(2) // Should increase
    })
  })

  describe('Data Persistence', () => {
    beforeEach(async () => {
      await courseSelectionService.initialize()
    })


    it('should handle save failures', async () => {
      spyOn(mockProfileStateManager, 'save').mockImplementation(() => {
        throw new Error('Save failed')
      })

      const result = await courseSelectionService.save()
      expect(result.success).toBe(false)
      expect(result.error).toContain('Save failed')
    })


    it('should auto-save by default (synchronous persistence)', async () => {
      const saveSpy = spyOn(mockProfileStateManager, 'save')

      await courseSelectionService.selectCourse(mockCourse)

      expect(saveSpy).toHaveBeenCalled()
    })
  })

  describe('Export/Import', () => {
    beforeEach(async () => {
      await courseSelectionService.initialize()
    })

    it('should export selections successfully', async () => {
      await courseSelectionService.selectCourse(mockCourse, { isRequired: true })
      await courseSelectionService.setSelectedSection(mockCourse, 'A01')

      const mockExportData = JSON.stringify({
        version: '1.0',
        timestamp: Date.now(),
        schedules: []
      })

      spyOn(mockProfileStateManager, 'exportData').mockResolvedValue(mockExportData)

      const result = await courseSelectionService.exportSelections()
      expect(result.success).toBe(true)
      expect(result.data).toBeTruthy()

      const exportedData = JSON.parse(result.data!)
      expect(exportedData.version).toBeTruthy()
      expect(exportedData.timestamp).toBeTruthy()
    })

  })

  describe('Health Checks and Error Recovery', () => {
    beforeEach(async () => {
      await courseSelectionService.initialize()
    })

    it('should perform health check successfully', async () => {
      const health = await courseSelectionService.performHealthCheck()
      expect(health.healthy).toBe(true)
      expect(health.issues).toEqual([])
    })

    it('should detect health issues', async () => {
      // Simulate unhealthy state
      spyOn(mockProfileStateManager, 'isHealthy').mockReturnValue({
        healthy: false,
        issues: ['State corruption detected']
      })
      
      const health = await courseSelectionService.performHealthCheck()
      expect(health.healthy).toBe(false)
      expect(health.issues.length).toBeGreaterThan(0)
    })

    it('should handle initialization errors gracefully', async () => {
      const uninitializedService = new CourseSelectionService()
      
      // Should handle operations on uninitialized service
      expect(uninitializedService.isCourseSelected(mockCourse)).toBe(false)
      expect(uninitializedService.getSelectedCourses()).toEqual([])
    })
  })

  describe('Concurrent Operations', () => {
    beforeEach(async () => {
      await courseSelectionService.initialize()
    })

    it('should handle multiple concurrent course selections', async () => {
      const courses = Array(5).fill(null).map((_, i) => ({
        ...mockCourse,
        id: `course-${i}`,
        number: `${i}01`
      }))

      // Select all courses concurrently
      const promises = courses.map(course => 
        courseSelectionService.selectCourse(course)
      )
      
      const results = await Promise.all(promises)
      
      results.forEach(result => {
        expect(result.success).toBe(true)
      })
      
      expect(courseSelectionService.getSelectedCoursesCount()).toBe(5)
    })

    it('should handle concurrent selection and section changes', async () => {
      await courseSelectionService.selectCourse(mockCourse)
      
      // Perform concurrent operations
      const promises = [
        courseSelectionService.setSelectedSection(mockCourse, 'A01'),
        courseSelectionService.selectCourse(mockCourse2),
        courseSelectionService.setSelectedSection(mockCourse, 'A02')
      ]
      
      const results = await Promise.allSettled(promises)
      
      // At least the course selection should succeed
      const successCount = results.filter(r => 
        r.status === 'fulfilled' && (r.value as any).success
      ).length
      
      expect(successCount).toBeGreaterThan(0)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    beforeEach(async () => {
      await courseSelectionService.initialize()
    })

    it('should handle malformed course data', async () => {
      const malformedCourse = {
        ...mockCourse,
        lectures: null,
        standaloneLabs: null
      } as any

      const result = await courseSelectionService.selectCourse(malformedCourse, { validateBeforeAdd: true })
      expect(result.success).toBe(true)
      expect(result.warnings).toBeTruthy()
      expect(result.warnings!.length).toBeGreaterThan(0)
    })

  })
})