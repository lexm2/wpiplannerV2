import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CourseManager } from '../../../src/core/CourseManager'
import { createMockCourse } from '../../helpers/mockData'

describe('CourseManager', () => {
  let courseManager: CourseManager
  let mockCourse1: any
  let mockCourse2: any

  beforeEach(() => {
    courseManager = new CourseManager()
    mockCourse1 = createMockCourse({ 
      id: 'CS-1101', 
      name: 'Intro to Programming'
    })
    mockCourse2 = createMockCourse({ 
      id: 'MA-1021', 
      name: 'Calculus I'
    })
  })

  describe('addCourse', () => {
    it('should add a course to selected courses', () => {
      courseManager.addCourse(mockCourse1)
      
      expect(courseManager.isSelected(mockCourse1)).toBe(true)
      expect(courseManager.getSelectedCourses()).toHaveLength(1)
      expect(courseManager.getSelectedCourses()[0].course.id).toBe('CS-1101')
    })

    it('should mark course as required when specified', () => {
      courseManager.addCourse(mockCourse1, true)
      
      const selectedCourse = courseManager.getSelectedCourse(mockCourse1)
      expect(selectedCourse?.isRequired).toBe(true)
    })

    it('should mark course as optional by default', () => {
      courseManager.addCourse(mockCourse1)
      
      const selectedCourse = courseManager.getSelectedCourse(mockCourse1)
      expect(selectedCourse?.isRequired).toBe(false)
    })

  })

  describe('removeCourse', () => {
    it('should remove a course from selected courses', () => {
      courseManager.addCourse(mockCourse1)
      courseManager.addCourse(mockCourse2)
      
      expect(courseManager.getSelectedCourses()).toHaveLength(2)
      
      courseManager.removeCourse(mockCourse1)
      
      expect(courseManager.isSelected(mockCourse1)).toBe(false)
      expect(courseManager.getSelectedCourses()).toHaveLength(1)
      expect(courseManager.getSelectedCourses()[0].course.id).toBe('MA-1021')
    })

    it('should do nothing if course is not selected', () => {
      courseManager.addCourse(mockCourse1)
      const nonExistentCourse = createMockCourse({ id: 'NONEXISTENT', name: 'Non-existent Course' })
      
      courseManager.removeCourse(nonExistentCourse)
      
      expect(courseManager.getSelectedCourses()).toHaveLength(1)
    })
  })


  describe('getAvailableSections', () => {
    beforeEach(() => {
      mockCourse1.sections = [
        { number: 'A01', periods: [] },
        { number: 'A02', periods: [] },
        { number: 'B01', periods: [] }
      ]
      courseManager.addCourse(mockCourse1)
    })

    it('should return all sections', () => {
      const sections = courseManager.getAvailableSections(mockCourse1)
      
      expect(sections).toHaveLength(3)
      expect(sections.map(s => s.number)).toEqual(['A01', 'A02', 'B01'])
    })

    it('should return empty array for non-existent course', () => {
      const nonExistentCourse = createMockCourse({ id: 'NONEXISTENT', name: 'Non-existent Course' })
      const sections = courseManager.getAvailableSections(nonExistentCourse)
      
      expect(sections).toEqual([])
    })
  })

  describe('clearAll', () => {
    it('should remove all selected courses', () => {
      courseManager.addCourse(mockCourse1)
      courseManager.addCourse(mockCourse2)
      
      expect(courseManager.getSelectedCourses()).toHaveLength(2)
      
      courseManager.clearAll()
      
      expect(courseManager.getSelectedCourses()).toHaveLength(0)
    })
  })

  describe('event listeners', () => {
    it('should notify listeners when course is added', () => {
      const listener = vi.fn()
      courseManager.onSelectionChange(listener)
      
      courseManager.addCourse(mockCourse1)
      
      expect(listener).toHaveBeenCalledWith([expect.objectContaining({ 
        course: mockCourse1 
      })])
    })

    it('should notify listeners when course is removed', () => {
      const listener = vi.fn()
      courseManager.addCourse(mockCourse1)
      courseManager.onSelectionChange(listener)
      
      courseManager.removeCourse(mockCourse1)
      
      expect(listener).toHaveBeenCalledWith([])
    })


    it('should allow removing listeners', () => {
      const listener = vi.fn()
      courseManager.onSelectionChange(listener)
      courseManager.offSelectionChange(listener)
      
      courseManager.addCourse(mockCourse1)
      
      expect(listener).not.toHaveBeenCalled()
    })
  })
})