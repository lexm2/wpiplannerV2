import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { TransactionalStorageManager } from '../../../src/core/TransactionalStorageManager'
import { Schedule, UserScheduleState, SchedulePreferences, SelectedCourse } from '../../../src/types/schedule'
import { mockLocalStorage } from '../../helpers/testUtils'

describe('TransactionalStorageManager', () => {
  let storageManager: TransactionalStorageManager
  let mockStorage: any
  let consoleSpy: any

  beforeEach(() => {
    storageManager = new TransactionalStorageManager()
    mockStorage = mockLocalStorage()
    consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true
    })
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('Transaction Operations', () => {
    it('should execute simple transaction successfully', async () => {
      const operations = [
        () => localStorage.setItem('test-key', 'test-value')
      ]

      const result = await storageManager.executeTransaction(operations)

      expect(result.success).toBe(true)
      expect(result.transactionId).toBeTruthy()
      expect(localStorage.getItem('test-key')).toBe('test-value')
    })

    it('should rollback on transaction failure', async () => {
      // Set initial value
      localStorage.setItem('test-key', 'initial-value')

      const operations = [
        () => localStorage.setItem('test-key', 'new-value'),
        () => { throw new Error('Simulated failure') }
      ]

      const result = await storageManager.executeTransaction(operations)

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
      expect(result.rolledBack).toBe(true)
      expect(localStorage.getItem('test-key')).toBe('initial-value')
    })

    it('should handle localStorage quota exceeded error', async () => {
      mockStorage.setItem.mockImplementation(() => {
        const error = new Error('QuotaExceededError')
        error.name = 'QuotaExceededError'
        throw error
      })

      const result = storageManager.saveUserState({
        activeSchedule: null,
        savedSchedules: [],
        preferences: {} as SchedulePreferences
      })

      expect(result.success).toBe(false)
      expect(result.error?.name).toBe('QuotaExceededError')
    })
  })

  describe('Data Integrity Verification', () => {
    it('should verify data integrity successfully', () => {
      const result = storageManager.isHealthy()
      expect(result.healthy).toBe(true)
      expect(result.issues).toEqual([])
    })

    it('should detect localStorage issues', () => {
      mockStorage.setItem.mockImplementation(() => {
        throw new Error('Storage not available')
      })

      const result = storageManager.isHealthy()
      expect(result.healthy).toBe(false)
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0]).toContain('localStorage unavailable')
    })

    it('should detect data corruption', () => {
      mockStorage.getItem.mockReturnValue('invalid json{')

      const result = storageManager.loadAllSchedules()
      expect(result.valid).toBe(false)
      expect(result.data).toEqual([])
      expect(result.error).toContain('Failed to load schedules')
    })
  })

  describe('Atomic Save Operations', () => {
    it('should save user state atomically', () => {
      const userState: UserScheduleState = {
        activeSchedule: null,
        savedSchedules: [],
        preferences: {
          preferredTimeRange: {
            startTime: { hours: 8, minutes: 0 },
            endTime: { hours: 18, minutes: 0 }
          },
          preferredDays: new Set(['mon', 'tue', 'wed']),
          avoidBackToBackClasses: false,
          theme: 'wpi-classic'
        }
      }

      const result = storageManager.saveUserState(userState)
      expect(result.success).toBe(true)

      const loaded = storageManager.loadUserState()
      expect(loaded.valid).toBe(true)
      expect(loaded.data).toEqual(userState)
    })

    it('should handle serialization of complex data types', () => {
      const preferences: SchedulePreferences = {
        preferredTimeRange: {
          startTime: { hours: 9, minutes: 30 },
          endTime: { hours: 17, minutes: 0 }
        },
        preferredDays: new Set(['mon', 'wed', 'fri']),
        avoidBackToBackClasses: true,
        theme: 'dark-mode'
      }

      const result = storageManager.savePreferences(preferences)
      expect(result.success).toBe(true)

      const loaded = storageManager.loadPreferences()
      expect(loaded.valid).toBe(true)
      expect(loaded.data).toEqual(preferences)
      expect(loaded.data.preferredDays).toBeInstanceOf(Set)
    })
  })

  describe('Schedule Management', () => {
    it('should save and load schedules with conflict resolution', () => {
      const schedule1: Schedule = {
        id: 'schedule-1',
        name: 'Test Schedule',
        selectedCourses: [],
        generatedSchedules: []
      }

      const schedule2: Schedule = {
        id: 'schedule-2',
        name: 'Another Schedule',
        selectedCourses: [],
        generatedSchedules: []
      }

      // Save both schedules
      expect(storageManager.saveSchedule(schedule1).success).toBe(true)
      expect(storageManager.saveSchedule(schedule2).success).toBe(true)

      // Load all schedules
      const loaded = storageManager.loadAllSchedules()
      expect(loaded.valid).toBe(true)
      expect(loaded.data).toHaveLength(2)
      expect(loaded.data?.find(s => s.id === 'schedule-1')).toEqual(schedule1)
      expect(loaded.data?.find(s => s.id === 'schedule-2')).toEqual(schedule2)
    })

    it('should update existing schedule atomically', () => {
      const originalSchedule: Schedule = {
        id: 'schedule-1',
        name: 'Original Name',
        selectedCourses: [],
        generatedSchedules: []
      }

      const updatedSchedule: Schedule = {
        ...originalSchedule,
        name: 'Updated Name'
      }

      // Save original
      expect(storageManager.saveSchedule(originalSchedule).success).toBe(true)

      // Update
      expect(storageManager.saveSchedule(updatedSchedule).success).toBe(true)

      // Verify only one schedule exists with updated data
      const loaded = storageManager.loadAllSchedules()
      expect(loaded.valid).toBe(true)
      expect(loaded.data).toHaveLength(1)
      expect(loaded.data?.[0].name).toBe('Updated Name')
    })

    it('should delete schedule atomically', () => {
      const schedule: Schedule = {
        id: 'schedule-1',
        name: 'Test Schedule',
        selectedCourses: [],
        generatedSchedules: []
      }

      // Save schedule
      expect(storageManager.saveSchedule(schedule).success).toBe(true)

      // Verify it exists
      expect(storageManager.loadSchedule('schedule-1').data).toEqual(schedule)

      // Delete schedule
      expect(storageManager.deleteSchedule('schedule-1').success).toBe(true)

      // Verify it's gone
      expect(storageManager.loadSchedule('schedule-1').data).toBeNull()
      expect(storageManager.loadAllSchedules().data).toEqual([])
    })
  })

  describe('Export/Import with Integrity Checks', () => {
    it('should export and import data with checksum validation', () => {
      const schedule: Schedule = {
        id: 'test-schedule',
        name: 'Test Schedule',
        selectedCourses: [],
        generatedSchedules: []
      }

      const preferences: SchedulePreferences = {
        preferredTimeRange: {
          startTime: { hours: 8, minutes: 0 },
          endTime: { hours: 17, minutes: 0 }
        },
        preferredDays: new Set(['mon', 'tue']),
        avoidBackToBackClasses: true,
        theme: 'wpi-classic'
      }

      // Save test data
      storageManager.saveSchedule(schedule)
      storageManager.savePreferences(preferences)

      // Export
      const exportResult = storageManager.exportData()
      expect(exportResult.valid).toBe(true)
      expect(exportResult.data).toBeTruthy()

      const exportedData = JSON.parse(exportResult.data!)
      expect(exportedData.version).toBe('2.0')
      expect(exportedData.checksum).toBeTruthy()

      // Clear storage
      storageManager.clearAllData()

      // Import
      const importResult = storageManager.importData(exportResult.data!)
      expect(importResult.success).toBe(true)

      // Verify imported data
      const loadedSchedules = storageManager.loadAllSchedules()
      const loadedPreferences = storageManager.loadPreferences()
      expect(loadedSchedules.data?.[0]).toEqual(schedule)
      expect(loadedPreferences.data).toEqual(preferences)
    })

    it('should reject import with invalid checksum', () => {
      const invalidData = JSON.stringify({
        version: '2.0',
        checksum: 'invalid-checksum',
        schedules: [],
        preferences: {}
      })

      const result = storageManager.importData(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('checksum mismatch')
    })
  })

  describe('Error Recovery', () => {
    it('should handle corrupted localStorage gracefully', () => {
      // Simulate corrupted data
      mockStorage.getItem.mockReturnValue('corrupted{json')

      const result = storageManager.loadUserState()
      expect(result.valid).toBe(false)
      expect(result.data).toBeNull()
      expect(result.error).toContain('Failed to load user state')
    })

    it('should handle localStorage unavailable gracefully', () => {
      mockStorage.getItem.mockImplementation(() => {
        throw new Error('localStorage not available')
      })

      const result = storageManager.loadSchedulePreferences()
      expect(result.valid).toBe(false)
      expect(result.data).toBe('wpi-classic') // Default theme
    })

    it('should provide fallback values on load failures', () => {
      mockStorage.getItem.mockImplementation(() => {
        throw new Error('Storage error')
      })

      const preferences = storageManager.loadPreferences()
      expect(preferences.valid).toBe(false)
      expect(preferences.data).toBeTruthy() // Should have default values
      expect(preferences.data.preferredDays).toBeInstanceOf(Set)
      expect(preferences.data.theme).toBe('wpi-classic')
    })
  })

  describe('Performance and Memory Management', () => {
    it('should handle large data sets without memory leaks', () => {
      // Create a large schedule with many courses
      const largeSchedule: Schedule = {
        id: 'large-schedule',
        name: 'Large Schedule',
        selectedCourses: Array(1000).fill(null).map((_, i) => ({
          course: {
            id: `course-${i}`,
            number: `${i}00`,
            name: `Test Course ${i}`,
            department: { abbreviation: 'TEST', name: 'Test Department' },
            sections: [],
            credits: 3,
            description: `Description for course ${i}`
          },
          selectedSection: null,
          selectedSectionNumber: null,
          isRequired: i % 2 === 0
        } as SelectedCourse)),
        generatedSchedules: []
      }

      const result = storageManager.saveSchedule(largeSchedule)
      expect(result.success).toBe(true)

      const loaded = storageManager.loadSchedule('large-schedule')
      expect(loaded.valid).toBe(true)
      expect(loaded.data?.selectedCourses.length).toBe(1000)
    })

    it('should clean up after failed transactions', async () => {
      const initialHealthCheck = storageManager.isHealthy()
      expect(initialHealthCheck.healthy).toBe(true)

      // Execute failing transaction
      const operations = [
        () => { throw new Error('Transaction failure') }
      ]

      const result = await storageManager.executeTransaction(operations)
      expect(result.success).toBe(false)

      // Verify system is still healthy after rollback
      const postFailureHealthCheck = storageManager.isHealthy()
      expect(postFailureHealthCheck.healthy).toBe(true)
    })
  })

  describe('Concurrent Access Protection', () => {
    it('should handle multiple rapid save operations', async () => {
      const promises = Array(10).fill(null).map(async (_, i) => {
        const schedule: Schedule = {
          id: `schedule-${i}`,
          name: `Schedule ${i}`,
          selectedCourses: [],
          generatedSchedules: []
        }
        return storageManager.saveSchedule(schedule)
      })

      const results = await Promise.all(promises)
      results.forEach(result => {
        expect(result.success).toBe(true)
      })

      const allSchedules = storageManager.loadAllSchedules()
      expect(allSchedules.valid).toBe(true)
      expect(allSchedules.data?.length).toBe(10)
    })
  })
})