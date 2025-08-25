import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { CourseSelectionService } from '../../../src/services/CourseSelectionService'
import { ProfileStateManager } from '../../../src/core/ProfileStateManager'
import { DataValidator } from '../../../src/core/DataValidator'
import { RetryManager } from '../../../src/core/RetryManager'
import { Course } from '../../../src/types/types'
import { mockLocalStorage } from '../../helpers/testUtils'

describe('CourseSelectionService', () => {
  let courseSelectionService: CourseSelectionService
  let mockProfileStateManager: ProfileStateManager
  let mockDataValidator: DataValidator
  let mockRetryManager: RetryManager
  let mockStorage: any
  let consoleSpy: any

  const mockCourse: Course = {
    id: 'CS-101',
    number: '101',
    name: 'Introduction to Computer Science',
    description: 'Basic CS course',
    credits: 3,
    department: { abbreviation: 'CS', name: 'Computer Science' },
    sections: [
      {
        crn: '12345',
        number: 'A01',
        instructor: 'Dr. Smith',
        seats: 30,
        seatsAvailable: 15,
        waitlist: 0,
        waitlistAvailable: 10,
        periods: [],
        term: 'Fall 2024'
      },
      {
        crn: '12346',
        number: 'A02',
        instructor: 'Dr. Jones',
        seats: 25,
        seatsAvailable: 10,
        waitlist: 0,
        waitlistAvailable: 5,
        periods: [],
        term: 'Fall 2024'
      }
    ]
  }

  const mockCourse2: Course = {
    id: 'MATH-101',
    number: '101', 
    name: 'Calculus I',
    description: 'Introduction to calculus',
    credits: 4,
    department: { abbreviation: 'MATH', name: 'Mathematics' },
    sections: [
      {
        crn: '22345',
        number: 'B01',
        instructor: 'Dr. Wilson',
        seats: 40,
        seatsAvailable: 20,
        waitlist: 0,
        waitlistAvailable: 10,
        periods: [],
        term: 'Fall 2024'
      }
    ]
  }

  beforeEach(() => {
    mockStorage = mockLocalStorage()
    consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true
    })

    mockProfileStateManager = new ProfileStateManager()
    mockDataValidator = new DataValidator()
    mockRetryManager = new RetryManager()

    courseSelectionService = new CourseSelectionService(
      mockProfileStateManager,
      mockDataValidator,
      mockRetryManager
    )
  })

  afterEach(() => {
    consoleSpy.restore()
  })

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const result = await courseSelectionService.initialize()
      expect(result).toBe(true)
    })

    it('should handle initialization failure gracefully', async () => {
      vi.spyOn(mockProfileStateManager, 'loadFromStorage').mockRejectedValue(new Error('Load failure'))
      
      const result = await courseSelectionService.initialize()
      expect(result).toBe(false)
    })

    it('should not initialize twice', async () => {
      const loadSpy = vi.spyOn(mockProfileStateManager, 'loadFromStorage')
      
      await courseSelectionService.initialize()
      await courseSelectionService.initialize()
      
      expect(loadSpy).toHaveBeenCalledTimes(1)
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

    it('should handle course selection with validation', async () => {
      const invalidCourse = { ...mockCourse, id: '' } // Invalid course

      const result = await courseSelectionService.selectCourse(invalidCourse, { validateBeforeAdd: true })
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid course')
    })

    it('should retry on selection failure', async () => {
      const retrySpy = vi.spyOn(mockRetryManager, 'executeWithRetry')
        .mockResolvedValueOnce({
          success: false,
          error: new Error('First attempt failed'),
          attempts: 1,
          totalTime: 100,
          lastAttemptTime: 100
        })
        .mockResolvedValueOnce({
          success: true,
          result: mockCourse,
          attempts: 2,
          totalTime: 200,
          lastAttemptTime: 100
        })

      // This would normally fail, but retry should handle it
      // For testing, we'll just verify retry was called
      await courseSelectionService.selectCourse(mockCourse)
      
      expect(retrySpy).toHaveBeenCalled()
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
      expect(result.course?.selectedSectionNumber).toBe('A01')
      expect(result.course?.selectedSection?.number).toBe('A01')

      expect(courseSelectionService.getSelectedSection(mockCourse)).toBe('A01')
    })

    it('should clear selected section', async () => {
      // First set a section
      await courseSelectionService.setSelectedSection(mockCourse, 'A01')
      expect(courseSelectionService.getSelectedSection(mockCourse)).toBe('A01')

      // Then clear it
      const result = await courseSelectionService.setSelectedSection(mockCourse, null)
      expect(result.success).toBe(true)
      expect(courseSelectionService.getSelectedSection(mockCourse)).toBeNull()
    })

    it('should validate section exists in course', async () => {
      const result = await courseSelectionService.setSelectedSection(mockCourse, 'INVALID')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found in course')
    })

    it('should require course to be selected first', async () => {
      const result = await courseSelectionService.setSelectedSection(mockCourse2, 'B01')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('must be selected before')
    })

    it('should get selected section object', async () => {
      await courseSelectionService.setSelectedSection(mockCourse, 'A01')
      
      const sectionObj = courseSelectionService.getSelectedSectionObject(mockCourse)
      expect(sectionObj).toBeTruthy()
      expect(sectionObj?.number).toBe('A01')
      expect(sectionObj?.instructor).toBe('Dr. Smith')
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
      const normalListener = vi.fn()
      
      courseSelectionService.addSelectionListener(errorListener)
      courseSelectionService.addSelectionListener(normalListener)
      
      // Should not throw despite error in first listener
      await expect(courseSelectionService.selectCourse(mockCourse)).resolves.not.toThrow()
      
      expect(normalListener).toHaveBeenCalled()
    })

    it('should remove listeners correctly', async () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()
      
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

    it('should save and maintain unsaved changes status', async () => {
      expect(courseSelectionService.hasUnsavedChanges()).toBe(false)
      
      await courseSelectionService.selectCourse(mockCourse)
      expect(courseSelectionService.hasUnsavedChanges()).toBe(true)
      
      const result = await courseSelectionService.save()
      expect(result.success).toBe(true)
      expect(courseSelectionService.hasUnsavedChanges()).toBe(false)
    })

    it('should handle save failures', async () => {
      vi.spyOn(mockProfileStateManager, 'save').mockResolvedValue({
        success: false,
        error: new Error('Save failed')
      })
      
      const result = await courseSelectionService.save()
      expect(result.success).toBe(false)
      expect(result.error).toContain('Save failed')
    })

    it('should auto-save when enabled', async () => {
      const saveSpy = vi.spyOn(mockProfileStateManager, 'save')
      
      await courseSelectionService.selectCourse(mockCourse, { autoSave: true })
      
      // Wait for debounced save
      await new Promise(resolve => setTimeout(resolve, 600))
      
      expect(saveSpy).toHaveBeenCalled()
    })

    it('should not auto-save when disabled', async () => {
      const saveSpy = vi.spyOn(mockProfileStateManager, 'save')
      
      await courseSelectionService.selectCourse(mockCourse, { autoSave: false })
      
      expect(saveSpy).not.toHaveBeenCalled()
    })
  })

  describe('Export/Import', () => {
    beforeEach(async () => {
      await courseSelectionService.initialize()
    })

    it('should export selections successfully', async () => {
      await courseSelectionService.selectCourse(mockCourse, { isRequired: true })
      await courseSelectionService.setSelectedSection(mockCourse, 'A01')
      
      const result = await courseSelectionService.exportSelections()
      expect(result.success).toBe(true)
      expect(result.data).toBeTruthy()
      
      const exportedData = JSON.parse(result.data!)
      expect(exportedData.version).toBeTruthy()
      expect(exportedData.timestamp).toBeTruthy()
    })

    it('should import selections successfully', async () => {
      // Create export data
      await courseSelectionService.selectCourse(mockCourse, { isRequired: true })
      const exportResult = await courseSelectionService.exportSelections()
      
      // Clear current selections
      await courseSelectionService.clearAllSelections()
      expect(courseSelectionService.getSelectedCoursesCount()).toBe(0)
      
      // Import
      const importResult = await courseSelectionService.importSelections(exportResult.data!)
      expect(importResult.success).toBe(true)
      
      // Verify data imported
      expect(courseSelectionService.getSelectedCoursesCount()).toBeGreaterThan(0)
    })

    it('should handle import of invalid data', async () => {
      const result = await courseSelectionService.importSelections('invalid json')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Import failed')
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
      vi.spyOn(mockProfileStateManager, 'isHealthy').mockReturnValue({
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
        sections: null // Invalid sections
      } as any

      const result = await courseSelectionService.selectCourse(malformedCourse, { validateBeforeAdd: true })
      expect(result.success).toBe(false)
    })

    it('should handle network/storage failures with retry', async () => {
      let attemptCount = 0
      vi.spyOn(mockRetryManager, 'executeWithRetry').mockImplementation(async (operation) => {
        attemptCount++
        if (attemptCount < 3) {
          return {
            success: false,
            error: new Error('Temporary failure'),
            attempts: attemptCount,
            totalTime: 100 * attemptCount,
            lastAttemptTime: 100
          }
        }
        return {
          success: true,
          result: await operation(),
          attempts: attemptCount,
          totalTime: 300,
          lastAttemptTime: 100
        }
      })

      const result = await courseSelectionService.selectCourse(mockCourse)
      expect(result.success).toBe(true)
      expect(attemptCount).toBe(3) // Should have retried
    })
  })
})