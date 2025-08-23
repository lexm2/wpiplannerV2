import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StorageManager } from '../../../src/core/StorageManager'
import { Schedule, UserScheduleState, SchedulePreferences } from '../../../src/types/schedule'
import { mockLocalStorage } from '../../helpers/testUtils'

describe('StorageManager', () => {
  let storageManager: StorageManager
  let mockStorage: any

  beforeEach(() => {
    storageManager = new StorageManager()
    mockStorage = mockLocalStorage()
    
    // Replace global localStorage with mock
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true
    })
  })

  describe('saveUserState and loadUserState', () => {
    it('should save and load user state', () => {
      const userState: UserScheduleState = {
        activeSchedule: null,
        savedSchedules: [],
        preferences: {
          preferredTimeRange: {
            startTime: { hours: 8, minutes: 0 },
            endTime: { hours: 18, minutes: 0 }
          },
          preferredDays: new Set(['mon', 'tue', 'wed', 'thu', 'fri']),
          avoidBackToBackClasses: false,
          maxDailyHours: 8,
        }
      }

      storageManager.saveUserState(userState)
      const loaded = storageManager.loadUserState()

      expect(loaded).toEqual(userState)
    })

    it('should return null when no user state exists', () => {
      const loaded = storageManager.loadUserState()
      
      expect(loaded).toBeNull()
    })

    it('should handle JSON parsing errors gracefully', () => {
      mockStorage.getItem.mockReturnValue('invalid json')
      
      const loaded = storageManager.loadUserState()
      
      expect(loaded).toBeNull()
    })
  })

  describe('saveSchedule and loadSchedule', () => {
    it('should save and load a schedule', () => {
      const schedule: Schedule = {
        id: 'schedule-1',
        name: 'My Schedule',
        selectedCourses: [],
        generatedSchedules: [],
        preferences: {
          preferredTimeRange: {
            startTime: { hours: 8, minutes: 0 },
            endTime: { hours: 18, minutes: 0 }
          },
          preferredDays: new Set(['mon', 'tue', 'wed', 'thu', 'fri']),
          avoidBackToBackClasses: false,
          maxDailyHours: 8,
        }
      }

      storageManager.saveSchedule(schedule)
      const loaded = storageManager.loadSchedule('schedule-1')

      expect(loaded).toEqual(schedule)
    })

    it('should return null for non-existent schedule', () => {
      const loaded = storageManager.loadSchedule('nonexistent')
      
      expect(loaded).toBeNull()
    })

    it('should update existing schedule when saving with same ID', () => {
      const schedule: Schedule = {
        id: 'schedule-1',
        name: 'Original Name',
        selectedCourses: [],
        generatedSchedules: [],
        preferences: {} as SchedulePreferences
      }

      const updatedSchedule: Schedule = {
        ...schedule,
        name: 'Updated Name'
      }

      storageManager.saveSchedule(schedule)
      storageManager.saveSchedule(updatedSchedule)
      
      const allSchedules = storageManager.loadAllSchedules()
      
      expect(allSchedules).toHaveLength(1)
      expect(allSchedules[0].name).toBe('Updated Name')
    })
  })

  describe('loadAllSchedules', () => {
    it('should load all saved schedules', () => {
      const schedule1: Schedule = {
        id: 'schedule-1',
        name: 'Schedule 1',
        selectedCourses: [],
        generatedSchedules: [],
        preferences: {} as SchedulePreferences
      }

      const schedule2: Schedule = {
        id: 'schedule-2', 
        name: 'Schedule 2',
        selectedCourses: [],
        generatedSchedules: [],
        preferences: {} as SchedulePreferences
      }

      storageManager.saveSchedule(schedule1)
      storageManager.saveSchedule(schedule2)
      
      const allSchedules = storageManager.loadAllSchedules()
      
      expect(allSchedules).toHaveLength(2)
      expect(allSchedules.map(s => s.id)).toContain('schedule-1')
      expect(allSchedules.map(s => s.id)).toContain('schedule-2')
    })

    it('should return empty array when no schedules exist', () => {
      const allSchedules = storageManager.loadAllSchedules()
      
      expect(allSchedules).toEqual([])
    })

    it('should handle JSON parsing errors gracefully', () => {
      mockStorage.getItem.mockReturnValue('invalid json')
      
      const allSchedules = storageManager.loadAllSchedules()
      
      expect(allSchedules).toEqual([])
    })
  })

  describe('deleteSchedule', () => {
    it('should delete a specific schedule', () => {
      const schedule1: Schedule = {
        id: 'schedule-1',
        name: 'Schedule 1',
        selectedCourses: [],
        generatedSchedules: [],
        preferences: {} as SchedulePreferences
      }

      const schedule2: Schedule = {
        id: 'schedule-2',
        name: 'Schedule 2', 
        selectedCourses: [],
        generatedSchedules: [],
        preferences: {} as SchedulePreferences
      }

      storageManager.saveSchedule(schedule1)
      storageManager.saveSchedule(schedule2)
      
      storageManager.deleteSchedule('schedule-1')
      
      const remaining = storageManager.loadAllSchedules()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe('schedule-2')
    })

    it('should do nothing when deleting non-existent schedule', () => {
      const schedule: Schedule = {
        id: 'schedule-1',
        name: 'Schedule 1',
        selectedCourses: [],
        generatedSchedules: [],
        preferences: {} as SchedulePreferences
      }

      storageManager.saveSchedule(schedule)
      storageManager.deleteSchedule('nonexistent')
      
      const schedules = storageManager.loadAllSchedules()
      expect(schedules).toHaveLength(1)
    })
  })

  describe('savePreferences and loadPreferences', () => {
    it('should save and load preferences', () => {
      const preferences: SchedulePreferences = {
        preferredTimeRange: {
          startTime: { hours: 9, minutes: 0 },
          endTime: { hours: 17, minutes: 0 }
        },
        preferredDays: new Set(['mon', 'wed', 'fri']),
        avoidBackToBackClasses: true,
        maxDailyHours: 6,
      }

      storageManager.savePreferences(preferences)
      const loaded = storageManager.loadPreferences()

      expect(loaded).toEqual(preferences)
    })

    it('should return default preferences when none exist', () => {
      const loaded = storageManager.loadPreferences()

      expect(loaded).toEqual({
        preferredTimeRange: {
          startTime: { hours: 8, minutes: 0 },
          endTime: { hours: 18, minutes: 0 }
        },
        preferredDays: new Set(['mon', 'tue', 'wed', 'thu', 'fri']),
        avoidBackToBackClasses: false,
        maxDailyHours: 8,
        theme: 'wpi-classic'
      })
    })

    it('should return default preferences on parsing error', () => {
      mockStorage.getItem.mockReturnValue('invalid json')
      
      const loaded = storageManager.loadPreferences()
      
      expect(loaded).toEqual({
        preferredTimeRange: {
          startTime: { hours: 8, minutes: 0 },
          endTime: { hours: 18, minutes: 0 }
        },
        preferredDays: new Set(['mon', 'tue', 'wed', 'thu', 'fri']),
        avoidBackToBackClasses: false,
        maxDailyHours: 8,
        theme: 'wpi-classic'
      })
    })
  })

  describe('clearAllData', () => {
    it('should remove all stored data', () => {
      const schedule: Schedule = {
        id: 'schedule-1',
        name: 'Schedule 1',
        selectedCourses: [],
        generatedSchedules: [],
        preferences: {} as SchedulePreferences
      }

      const preferences: SchedulePreferences = {
        preferredTimeRange: {
          startTime: { hours: 9, minutes: 0 },
          endTime: { hours: 17, minutes: 0 }
        },
        preferredDays: new Set(['mon']),
        avoidBackToBackClasses: true,
        maxDailyHours: 6,
        preferredBuildings: []
      }

      storageManager.saveSchedule(schedule)
      storageManager.savePreferences(preferences)
      
      storageManager.clearAllData()
      
      expect(storageManager.loadAllSchedules()).toEqual([])
      expect(storageManager.loadUserState()).toBeNull()
      // Preferences should return defaults after clearing
      expect(storageManager.loadPreferences()?.avoidBackToBackClasses).toBe(false)
    })
  })

  describe('exportData and importData', () => {
    it('should export and import all data', () => {
      const schedule: Schedule = {
        id: 'schedule-1',
        name: 'Schedule 1',
        selectedCourses: [],
        generatedSchedules: [],
        preferences: {} as SchedulePreferences
      }

      const preferences: SchedulePreferences = {
        preferredTimeRange: {
          startTime: { hours: 9, minutes: 0 },
          endTime: { hours: 17, minutes: 0 }
        },
        preferredDays: new Set(['mon']),
        avoidBackToBackClasses: true,
        maxDailyHours: 6,
        preferredBuildings: []
      }

      const userState: UserScheduleState = {
        activeSchedule: null,
        savedSchedules: [schedule],
        preferences
      }

      storageManager.saveSchedule(schedule)
      storageManager.savePreferences(preferences)
      storageManager.saveUserState(userState)

      const exported = storageManager.exportData()
      
      storageManager.clearAllData()
      
      const imported = storageManager.importData(exported)
      
      expect(imported).toBe(true)
      expect(storageManager.loadAllSchedules()).toHaveLength(1)
      expect(storageManager.loadPreferences()?.avoidBackToBackClasses).toBe(true)
      expect(storageManager.loadUserState()?.savedSchedules).toHaveLength(1)
    })

    it('should return false for invalid import data', () => {
      const result = storageManager.importData('invalid json')
      
      expect(result).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should handle localStorage errors gracefully', () => {
      // Mock localStorage to throw errors
      mockStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded')
      })

      const schedule: Schedule = {
        id: 'schedule-1',
        name: 'Schedule 1',
        selectedCourses: [],
        generatedSchedules: [],
        preferences: {} as SchedulePreferences
      }

      // Should not throw
      expect(() => {
        storageManager.saveSchedule(schedule)
      }).not.toThrow()
    })
  })
})