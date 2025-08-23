import { describe, it, expect, beforeEach } from 'vitest'
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
      
      expect(courseManager.isSelected('CS-1101')).toBe(true)
      expect(courseManager.getSelectedCourses()).toHaveLength(1)
      expect(courseManager.getSelectedCourses()[0].course.id).toBe('CS-1101')
    })

    it('should mark course as required when specified', () => {
      courseManager.addCourse(mockCourse1, true)
      
      const selectedCourse = courseManager.getSelectedCourse('CS-1101')
      expect(selectedCourse?.isRequired).toBe(true)
    })

    it('should mark course as optional by default', () => {
      courseManager.addCourse(mockCourse1)
      
      const selectedCourse = courseManager.getSelectedCourse('CS-1101')
      expect(selectedCourse?.isRequired).toBe(false)
    })

    it('should initialize with empty section preferences', () => {
      courseManager.addCourse(mockCourse1)
      
      const selectedCourse = courseManager.getSelectedCourse('CS-1101')
      expect(selectedCourse?.preferredSections).toBeInstanceOf(Set)
      expect(selectedCourse?.preferredSections.size).toBe(0)
      expect(selectedCourse?.deniedSections).toBeInstanceOf(Set)
      expect(selectedCourse?.deniedSections.size).toBe(0)
    })
  })

  describe('removeCourse', () => {
    it('should remove a course from selected courses', () => {
      courseManager.addCourse(mockCourse1)
      courseManager.addCourse(mockCourse2)
      
      expect(courseManager.getSelectedCourses()).toHaveLength(2)
      
      courseManager.removeCourse('CS-1101')
      
      expect(courseManager.isSelected('CS-1101')).toBe(false)
      expect(courseManager.getSelectedCourses()).toHaveLength(1)
      expect(courseManager.getSelectedCourses()[0].course.id).toBe('MA-1021')
    })

    it('should do nothing if course is not selected', () => {
      courseManager.addCourse(mockCourse1)
      
      courseManager.removeCourse('NONEXISTENT')
      
      expect(courseManager.getSelectedCourses()).toHaveLength(1)
    })
  })

  describe('updateSectionPreference', () => {
    beforeEach(() => {
      courseManager.addCourse(mockCourse1)
    })

    it('should add section to preferred list', () => {
      courseManager.updateSectionPreference('CS-1101', 'A01', 'preferred')
      
      const selectedCourse = courseManager.getSelectedCourse('CS-1101')
      expect(selectedCourse?.preferredSections.has('A01')).toBe(true)
      expect(selectedCourse?.deniedSections.has('A01')).toBe(false)
    })

    it('should add section to denied list', () => {
      courseManager.updateSectionPreference('CS-1101', 'A01', 'denied')
      
      const selectedCourse = courseManager.getSelectedCourse('CS-1101')
      expect(selectedCourse?.deniedSections.has('A01')).toBe(true)
      expect(selectedCourse?.preferredSections.has('A01')).toBe(false)
    })

    it('should move section from denied to preferred', () => {
      courseManager.updateSectionPreference('CS-1101', 'A01', 'denied')
      courseManager.updateSectionPreference('CS-1101', 'A01', 'preferred')
      
      const selectedCourse = courseManager.getSelectedCourse('CS-1101')
      expect(selectedCourse?.preferredSections.has('A01')).toBe(true)
      expect(selectedCourse?.deniedSections.has('A01')).toBe(false)
    })

    it('should move section from preferred to denied', () => {
      courseManager.updateSectionPreference('CS-1101', 'A01', 'preferred')
      courseManager.updateSectionPreference('CS-1101', 'A01', 'denied')
      
      const selectedCourse = courseManager.getSelectedCourse('CS-1101')
      expect(selectedCourse?.deniedSections.has('A01')).toBe(true)
      expect(selectedCourse?.preferredSections.has('A01')).toBe(false)
    })

    it('should do nothing for non-existent course', () => {
      courseManager.updateSectionPreference('NONEXISTENT', 'A01', 'preferred')
      
      expect(courseManager.getSelectedCourse('NONEXISTENT')).toBeUndefined()
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

    it('should return all sections when none are denied', () => {
      const sections = courseManager.getAvailableSections('CS-1101')
      
      expect(sections).toHaveLength(3)
      expect(sections.map(s => s.number)).toEqual(['A01', 'A02', 'B01'])
    })

    it('should exclude denied sections', () => {
      courseManager.updateSectionPreference('CS-1101', 'A02', 'denied')
      
      const sections = courseManager.getAvailableSections('CS-1101')
      
      expect(sections).toHaveLength(2)
      expect(sections.map(s => s.number)).toEqual(['A01', 'B01'])
    })

    it('should return empty array for non-existent course', () => {
      const sections = courseManager.getAvailableSections('NONEXISTENT')
      
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
      
      courseManager.removeCourse('CS-1101')
      
      expect(listener).toHaveBeenCalledWith([])
    })

    it('should notify listeners when section preference is updated', () => {
      const listener = vi.fn()
      courseManager.addCourse(mockCourse1)
      courseManager.onSelectionChange(listener)
      
      courseManager.updateSectionPreference('CS-1101', 'A01', 'preferred')
      
      expect(listener).toHaveBeenCalled()
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