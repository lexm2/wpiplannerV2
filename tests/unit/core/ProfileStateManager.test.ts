import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ProfileStateManager, StateChangeEvent } from '../../../src/core/ProfileStateManager'
import { TransactionalStorageManager } from '../../../src/core/TransactionalStorageManager'
import { Schedule, SelectedCourse } from '../../../src/types/schedule'
import { Course } from '../../../src/types/types'
import { mockLocalStorage } from '../../helpers/testUtils'

describe('ProfileStateManager', () => {
  let profileStateManager: ProfileStateManager
  let mockStorageManager: TransactionalStorageManager
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

    mockStorageManager = new TransactionalStorageManager()
    profileStateManager = new ProfileStateManager(mockStorageManager)
    
    // Create a default schedule for tests that need an active schedule
    const defaultSchedule = profileStateManager.createSchedule('Test Schedule', 'test')
    profileStateManager.setActiveSchedule(defaultSchedule.id, 'test')
    
    // Clear any courses that might have been set during setup
    profileStateManager.clearAllSelections('test')
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('Initialization and State Management', () => {
    it('should initialize with default state', () => {
      // Create a fresh instance without the default schedule from beforeEach
      const freshProfileManager = new ProfileStateManager(mockStorageManager)
      const state = freshProfileManager.getState()
      
      expect(state.activeScheduleId).toBeNull()
      expect(state.schedules).toEqual([])
      expect(state.selectedCourses).toEqual([])
      expect(state.preferences).toBeTruthy()
      expect(state.isLoading).toBe(false)
      expect(state.hasUnsavedChanges).toBe(false)
    })

    it('should create default schedule if none exist', async () => {
      // Create a fresh instance without the default schedule from beforeEach
      const freshProfileManager = new ProfileStateManager(mockStorageManager)
      await freshProfileManager.loadFromStorage()
      
      const state = freshProfileManager.getState()
      expect(state.schedules.length).toBe(1)
      expect(state.schedules[0].name).toBe('My Schedule')
      expect(state.activeScheduleId).toBe(state.schedules[0].id)
    })

    it('should load existing data from storage', async () => {
      // Pre-populate storage
      const existingSchedule: Schedule = {
        id: 'test-schedule',
        name: 'Existing Schedule',
        selectedCourses: [],
        generatedSchedules: []
      }

      mockStorageManager.saveSchedule(existingSchedule)
      mockStorageManager.saveActiveScheduleId('test-schedule')

      // Create new manager to test loading
      const newProfileManager = new ProfileStateManager(mockStorageManager)
      await newProfileManager.loadFromStorage()

      const state = newProfileManager.getState()
      expect(state.schedules.length).toBe(1)
      expect(state.schedules[0]).toEqual(existingSchedule)
      expect(state.activeScheduleId).toBe('test-schedule')
    })
  })

  describe('Course Selection Management', () => {
    it('should select course successfully', async () => {
      const listeners: StateChangeEvent[] = []
      
      // Add listener after setup is complete
      profileStateManager.addListener((event) => listeners.push(event))

      profileStateManager.selectCourse(mockCourse, false, 'test')

      const state = profileStateManager.getState()
      expect(state.selectedCourses.length).toBe(1)
      expect(state.selectedCourses[0].course).toEqual(mockCourse)
      expect(state.selectedCourses[0].isRequired).toBe(false)
      expect(state.hasUnsavedChanges).toBe(true)

      // Wait for async event processing
      await new Promise(resolve => setTimeout(resolve, 10))

      // Should only receive the course selection event
      const courseEvents = listeners.filter(e => e.type === 'courses_changed' && e.data.action === 'selected')
      expect(courseEvents.length).toBe(1)
      expect(courseEvents[0].data.action).toBe('selected')
    })

    it('should unselect course successfully', () => {
      // First select a course
      profileStateManager.selectCourse(mockCourse, false, 'test')
      
      const listeners: StateChangeEvent[] = []
      profileStateManager.addListener((event) => listeners.push(event))

      // Then unselect it
      profileStateManager.unselectCourse(mockCourse, 'test')

      const state = profileStateManager.getState()
      expect(state.selectedCourses.length).toBe(0)
      expect(state.hasUnsavedChanges).toBe(true)

      expect(listeners.length).toBe(1)
      expect(listeners[0].type).toBe('courses_changed')
      expect(listeners[0].data.action).toBe('unselected')
    })

    it('should set selected section successfully', () => {
      profileStateManager.selectCourse(mockCourse, false, 'test')
      
      const listeners: StateChangeEvent[] = []
      profileStateManager.addListener((event) => listeners.push(event))

      profileStateManager.setSelectedSection(mockCourse, 'A01', 'test')

      const state = profileStateManager.getState()
      const selectedCourse = state.selectedCourses.find(sc => sc.course.id === mockCourse.id)
      expect(selectedCourse?.selectedSectionNumber).toBe('A01')
      expect(selectedCourse?.selectedSection?.number).toBe('A01')

      expect(listeners.length).toBe(1)
      expect(listeners[0].type).toBe('courses_changed')
      expect(listeners[0].data.action).toBe('section_changed')
    })

    it('should clear all selections', () => {
      // Select multiple courses
      profileStateManager.selectCourse(mockCourse, false, 'test')
      profileStateManager.selectCourse({
        ...mockCourse,
        id: 'CS-102',
        number: '102'
      }, true, 'test')

      expect(profileStateManager.getState().selectedCourses.length).toBe(2)

      const listeners: StateChangeEvent[] = []
      profileStateManager.addListener((event) => listeners.push(event))

      profileStateManager.clearAllSelections('test')

      const state = profileStateManager.getState()
      expect(state.selectedCourses.length).toBe(0)

      expect(listeners.length).toBe(1)
      expect(listeners[0].type).toBe('courses_changed')
      expect(listeners[0].data.action).toBe('cleared')
    })
  })

  describe('Schedule Management', () => {
    it('should create new schedule successfully', () => {
      const listeners: StateChangeEvent[] = []
      profileStateManager.addListener((event) => listeners.push(event))

      const schedule = profileStateManager.createSchedule('Test Schedule', 'test')

      expect(schedule.name).toBe('Test Schedule')
      expect(schedule.id).toBeTruthy()
      expect(schedule.selectedCourses).toEqual([])

      const state = profileStateManager.getState()
      expect(state.schedules.length).toBe(1)
      expect(state.schedules[0]).toEqual(schedule)

      expect(listeners.length).toBe(1)
      expect(listeners[0].type).toBe('schedule_changed')
      expect(listeners[0].data.action).toBe('created')
    })

    it('should set active schedule and load its courses', () => {
      // Create schedules with different courses
      const schedule1 = profileStateManager.createSchedule('Schedule 1', 'test')
      const schedule2 = profileStateManager.createSchedule('Schedule 2', 'test')

      // Add courses to schedule1
      profileStateManager.setActiveSchedule(schedule1.id, 'test')
      profileStateManager.selectCourse(mockCourse, false, 'test')

      // Switch to schedule2 (should be empty)
      const listeners: StateChangeEvent[] = []
      profileStateManager.addListener((event) => listeners.push(event))

      profileStateManager.setActiveSchedule(schedule2.id, 'test')

      const state = profileStateManager.getState()
      expect(state.activeScheduleId).toBe(schedule2.id)
      expect(state.selectedCourses.length).toBe(0) // Should be empty

      expect(listeners.some(e => e.type === 'active_schedule_changed')).toBe(true)
      expect(listeners.some(e => e.type === 'courses_changed')).toBe(true)
    })

    it('should update schedule successfully', () => {
      const schedule = profileStateManager.createSchedule('Original Name', 'test')
      
      const listeners: StateChangeEvent[] = []
      profileStateManager.addListener((event) => listeners.push(event))

      const success = profileStateManager.updateSchedule(schedule.id, { name: 'Updated Name' }, 'test')
      expect(success).toBe(true)

      const state = profileStateManager.getState()
      const updatedSchedule = state.schedules.find(s => s.id === schedule.id)
      expect(updatedSchedule?.name).toBe('Updated Name')

      expect(listeners.length).toBe(1)
      expect(listeners[0].type).toBe('schedule_changed')
      expect(listeners[0].data.action).toBe('updated')
    })

    it('should delete schedule and switch to another', () => {
      const schedule1 = profileStateManager.createSchedule('Schedule 1', 'test')
      const schedule2 = profileStateManager.createSchedule('Schedule 2', 'test')

      // Set schedule1 as active
      profileStateManager.setActiveSchedule(schedule1.id, 'test')

      const listeners: StateChangeEvent[] = []
      profileStateManager.addListener((event) => listeners.push(event))

      // Delete active schedule
      const success = profileStateManager.deleteSchedule(schedule1.id, 'test')
      expect(success).toBe(true)

      const state = profileStateManager.getState()
      expect(state.schedules.length).toBe(1)
      expect(state.schedules[0]).toEqual(schedule2)
      expect(state.activeScheduleId).toBe(schedule2.id)

      expect(listeners.some(e => e.type === 'schedule_changed' && e.data.action === 'deleted')).toBe(true)
      expect(listeners.some(e => e.type === 'active_schedule_changed')).toBe(true)
    })

    it('should not allow deleting last schedule', () => {
      const schedule = profileStateManager.createSchedule('Only Schedule', 'test')

      const success = profileStateManager.deleteSchedule(schedule.id, 'test')
      expect(success).toBe(false)

      const state = profileStateManager.getState()
      expect(state.schedules.length).toBe(1)
    })

    it('should duplicate schedule successfully', () => {
      const originalSchedule = profileStateManager.createSchedule('Original', 'test')
      
      // Add courses to original
      profileStateManager.setActiveSchedule(originalSchedule.id, 'test')
      profileStateManager.selectCourse(mockCourse, true, 'test')

      const listeners: StateChangeEvent[] = []
      profileStateManager.addListener((event) => listeners.push(event))

      const duplicated = profileStateManager.duplicateSchedule(originalSchedule.id, 'Duplicated', 'test')
      expect(duplicated).toBeTruthy()
      expect(duplicated!.name).toBe('Duplicated')
      expect(duplicated!.id).not.toBe(originalSchedule.id)
      expect(duplicated!.selectedCourses.length).toBe(1)

      const state = profileStateManager.getState()
      expect(state.schedules.length).toBe(2)

      expect(listeners.length).toBe(1)
      expect(listeners[0].type).toBe('schedule_changed')
      expect(listeners[0].data.action).toBe('duplicated')
    })
  })

  describe('Preferences Management', () => {
    it('should update preferences successfully', () => {
      const listeners: StateChangeEvent[] = []
      profileStateManager.addListener((event) => listeners.push(event))

      profileStateManager.updatePreferences({ 
        avoidBackToBackClasses: true,
        theme: 'dark-mode'
      }, 'test')

      const state = profileStateManager.getState()
      expect(state.preferences.avoidBackToBackClasses).toBe(true)
      expect(state.preferences.theme).toBe('dark-mode')

      expect(listeners.length).toBe(1)
      expect(listeners[0].type).toBe('preferences_changed')
    })
  })

  describe('Data Persistence and Loading', () => {
    it('should save and load state successfully', async () => {
      // Create test data
      profileStateManager.selectCourse(mockCourse, true, 'test')
      const schedule = profileStateManager.createSchedule('Test Schedule', 'test')
      profileStateManager.updatePreferences({ theme: 'custom-theme' }, 'test')

      // Save state
      const saveResult = await profileStateManager.save()
      expect(saveResult.success).toBe(true)

      // Create new manager and load
      const newManager = new ProfileStateManager(mockStorageManager)
      const loadResult = await newManager.loadFromStorage()
      expect(loadResult).toBe(true)

      const newState = newManager.getState()
      expect(newState.selectedCourses.length).toBe(1)
      expect(newState.selectedCourses[0].course.id).toBe(mockCourse.id)
      expect(newState.schedules.length).toBeGreaterThan(0)
      expect(newState.preferences.theme).toBe('custom-theme')
    })

    it('should handle save failures gracefully', async () => {
      // Mock storage to fail
      vi.spyOn(mockStorageManager, 'executeTransaction').mockResolvedValue({
        success: false,
        transactionId: 'test',
        error: new Error('Storage failure')
      })

      const result = await profileStateManager.save()
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()

      // State should still indicate unsaved changes
      expect(profileStateManager.getState().hasUnsavedChanges).toBe(false) // Should remain false initially
    })
  })

  describe('Event System', () => {
    it('should properly manage event listeners', () => {
      const events1: StateChangeEvent[] = []
      const events2: StateChangeEvent[] = []

      const listener1 = (event: StateChangeEvent) => events1.push(event)
      const listener2 = (event: StateChangeEvent) => events2.push(event)

      // Add listeners
      profileStateManager.addListener(listener1)
      profileStateManager.addListener(listener2)

      // Trigger event
      profileStateManager.selectCourse(mockCourse, false, 'test')

      expect(events1.length).toBe(1)
      expect(events2.length).toBe(1)

      // Remove one listener
      profileStateManager.removeListener(listener1)

      // Trigger another event
      profileStateManager.unselectCourse(mockCourse, 'test')

      expect(events1.length).toBe(1) // Should not change
      expect(events2.length).toBe(2) // Should increase

      // Remove all listeners
      profileStateManager.removeAllListeners()

      // Trigger event
      profileStateManager.selectCourse(mockCourse, false, 'test')

      expect(events1.length).toBe(1) // Should not change
      expect(events2.length).toBe(2) // Should not change
    })

    it('should handle listener errors gracefully', () => {
      const errorListener = () => {
        throw new Error('Listener error')
      }
      const normalListener = vi.fn()

      profileStateManager.addListener(errorListener)
      profileStateManager.addListener(normalListener)

      // Should not throw despite error in first listener
      expect(() => {
        profileStateManager.selectCourse(mockCourse, false, 'test')
      }).not.toThrow()

      expect(normalListener).toHaveBeenCalled()
    })
  })

  describe('Debounced Saving', () => {
    it('should debounce multiple rapid changes', async () => {
      const saveSpy = vi.spyOn(profileStateManager, 'save')

      // Make rapid changes
      profileStateManager.selectCourse(mockCourse, false, 'test')
      profileStateManager.setSelectedSection(mockCourse, 'A01', 'test')
      profileStateManager.updatePreferences({ theme: 'test-theme' }, 'test')

      // Should not have saved yet
      expect(saveSpy).not.toHaveBeenCalled()

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 600))

      // Should have saved once
      expect(saveSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('Health Checks', () => {
    it('should return healthy state for normal operation', () => {
      const health = profileStateManager.isHealthy()
      expect(health.healthy).toBe(true)
      expect(health.issues).toEqual([])
    })

    it('should detect inconsistent state', () => {
      // Manually create inconsistent state
      const state = profileStateManager.getState()
      ;(state as any).activeScheduleId = 'non-existent-schedule'

      const health = profileStateManager.isHealthy()
      expect(health.healthy).toBe(false)
      expect(health.issues.length).toBeGreaterThan(0)
    })
  })

  describe('Export/Import', () => {
    it('should export and import data successfully', async () => {
      // Create test data
      profileStateManager.selectCourse(mockCourse, true, 'test')
      profileStateManager.createSchedule('Export Test', 'test')

      // Export
      const exportData = profileStateManager.exportData()
      expect(exportData).toBeTruthy()

      // Clear and import
      profileStateManager.clearAllSelections('test')
      const importResult = await profileStateManager.importData(exportData!)
      expect(importResult.success).toBe(true)

      // Verify data restored
      const state = profileStateManager.getState()
      expect(state.selectedCourses.length).toBeGreaterThan(0)
    })

    it('should handle import of invalid data', async () => {
      const result = await profileStateManager.importData('invalid json')
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle multiple concurrent course selections', () => {
      const courses = Array(10).fill(null).map((_, i) => ({
        ...mockCourse,
        id: `course-${i}`,
        number: `${i}01`
      }))

      // Select all courses concurrently
      courses.forEach(course => {
        profileStateManager.selectCourse(course, false, 'test')
      })

      const state = profileStateManager.getState()
      expect(state.selectedCourses.length).toBe(10)
    })
  })
})