import { describe, it, expect, beforeEach, spyOn } from 'bun:test'
import { ProfileStateManager } from '../../../src/core/state/ProfileStateManager'
import { TransactionalStorageManager } from '../../../src/core/storage/TransactionalStorageManager'
import { mockLocalStorage } from '../../helpers/testUtils'
import { createMockCourse, createMockSection } from '../../helpers/mockData'

/**
 * Standalone tests for the new withBatch() and withBatchSync() API
 * These tests verify that the universal batch API works correctly
 */
describe('Batch Operations API (Standalone)', () => {
  let profileStateManager: ProfileStateManager
  let mockStorage: any

  const mockSection = createMockSection({
    crn: 12345,
    number: 'A01',
    description: 'Fall 2024 section',
    term: 'Fall 2024',
    computedTerm: 'A',
    periods: []
  })

  const mockCourse = createMockCourse({
    id: 'CS-101',
    number: '101',
    name: 'Introduction to Computer Science',
    description: 'Basic CS course',
    lectures: [{
      section: mockSection,
      compatibleDiscussions: [],
      compatibleLabs: []
    }]
  })

  beforeEach(() => {
    mockStorage = mockLocalStorage()

    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true
    })

    ProfileStateManager.resetInstance()
    new TransactionalStorageManager()
    profileStateManager = ProfileStateManager.getInstance()

    // Create a default schedule
    const defaultSchedule = profileStateManager.createSchedule('Test Schedule', 'test')
    profileStateManager.setActiveSchedule(defaultSchedule.id, 'test')
    profileStateManager.clearAllSelections('test')
  })

  it('✅ withBatch executes with single save', async () => {
    const saveSpy = spyOn(profileStateManager, 'save')

    await profileStateManager.withBatch(async () => {
      profileStateManager.selectCourse(mockCourse, false, 'test')
      profileStateManager.selectCourse({
        ...mockCourse,
        id: 'CS-102',
        number: '102'
      }, false, 'test')
    })

    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(profileStateManager.getState().selectedCourses.length).toBe(2)
  })

  it('✅ withBatch returns value correctly', async () => {
    const result = await profileStateManager.withBatch(async () => {
      return 'success'
    })

    expect(result).toBe('success')
  })

  it('✅ withBatchSync works synchronously', () => {
    const result = profileStateManager.withBatchSync(() => {
      profileStateManager.selectCourse(mockCourse, false, 'test')
      return 42
    })

    expect(result).toBe(42)
    expect(profileStateManager.getState().selectedCourses.length).toBe(1)
  })

  it('✅ nested batches only save once', async () => {
    const saveSpy = spyOn(profileStateManager, 'save')

    await profileStateManager.withBatch(async () => {
      profileStateManager.selectCourse(mockCourse, false, 'test')

      await profileStateManager.withBatch(async () => {
        profileStateManager.selectCourse({
          ...mockCourse,
          id: 'CS-102',
          number: '102'
        }, false, 'test')
      })
    })

    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(profileStateManager.getState().selectedCourses.length).toBe(2)
  })

  it('✅ batch handles errors and still saves', async () => {
    const saveSpy = spyOn(profileStateManager, 'save')

    await expect(async () => {
      await profileStateManager.withBatch(async () => {
        profileStateManager.selectCourse(mockCourse, false, 'test')
        throw new Error('Test error')
      })
    }).toThrow('Test error')

    expect(profileStateManager.getState().selectedCourses.length).toBe(1)
    expect(saveSpy).toHaveBeenCalled()
  })

  it('✅ batch suppresses sync events during operation', async () => {
    const syncEventBusSpy = spyOn(require('../../../src/services/sync/SyncEventBus').syncEventBus, 'emitEvent')

    await profileStateManager.withBatch(async () => {
      profileStateManager.selectCourse(mockCourse, false, 'test')
      profileStateManager.selectCourse({
        ...mockCourse,
        id: 'CS-102',
        number: '102'
      }, false, 'test')
      profileStateManager.selectCourse({
        ...mockCourse,
        id: 'CS-103',
        number: '103'
      }, false, 'test')
    })

    const saveCompletedEvents = syncEventBusSpy.mock.calls.filter(
      call => call[0] === 'local-save-completed'
    )

    // Should only emit once at the end
    expect(saveCompletedEvents.length).toBe(1)
  })

  it('✅ complex batch operations maintain integrity', async () => {
    const schedule1 = profileStateManager.createSchedule('Schedule 1', 'test')
    const schedule2 = profileStateManager.createSchedule('Schedule 2', 'test')

    await profileStateManager.withBatch(async () => {
      profileStateManager.setActiveSchedule(schedule1.id, 'test')
      profileStateManager.selectCourse(mockCourse, true, 'test')

      profileStateManager.setActiveSchedule(schedule2.id, 'test')
      profileStateManager.selectCourse({
        ...mockCourse,
        id: 'CS-200',
        number: '200'
      }, false, 'test')
    })

    const state = profileStateManager.getState()
    expect(state.activeScheduleId).toBe(schedule2.id)
    expect(state.selectedCourses.length).toBe(1)
    expect(state.selectedCourses[0].course.id).toBe('CS-200')
  })

  it('✅ empty batch still calls save once', async () => {
    const saveSpy = spyOn(profileStateManager, 'save')

    await profileStateManager.withBatch(async () => {
      // Empty batch
    })

    expect(saveSpy).toHaveBeenCalledTimes(1)
  })

  it('✅ withBatchSync error handling', () => {
    const saveSpy = spyOn(profileStateManager, 'save')

    expect(() => {
      profileStateManager.withBatchSync(() => {
        profileStateManager.selectCourse(mockCourse, false, 'test')
        throw new Error('Sync error')
      })
    }).toThrow('Sync error')

    expect(profileStateManager.getState().selectedCourses.length).toBe(1)
    expect(saveSpy).toHaveBeenCalled()
  })
})
