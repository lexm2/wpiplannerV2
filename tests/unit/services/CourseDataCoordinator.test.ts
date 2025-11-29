import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { CourseDataCoordinator } from '../../../src/services/CourseDataCoordinator'
import { createMockScheduleDB, createMockDepartment } from '../../helpers/mockData'
import type { Department } from '../../../src/types/types'

describe('CourseDataCoordinator', () => {
  let coordinator: CourseDataCoordinator
  let mockCourseDataService: any
  let mockTimestampManager: any
  let mockCourseSelectionService: any
  let mockScheduleManagementService: any
  let consoleSpy: any
  let consoleWarnSpy: any

  beforeEach(() => {
    // Create mock ScheduleDB with departments
    const mockScheduleDB = createMockScheduleDB()
    const mockDept1 = createMockDepartment({ abbreviation: 'CS', name: 'Computer Science' })
    const mockDept2 = createMockDepartment({ abbreviation: 'MA', name: 'Mathematics' })
    mockScheduleDB.departments = [mockDept1, mockDept2]

    // Mock CourseDataService
    mockCourseDataService = {
      loadCourseData: vi.fn().mockResolvedValue(mockScheduleDB)
    }

    // Mock TimestampManager
    mockTimestampManager = {
      updateClientTimestamp: vi.fn(),
      loadServerTimestamp: vi.fn().mockResolvedValue('2025-11-29T12:00:00Z')
    }

    // Mock CourseSelectionService
    mockCourseSelectionService = {
      reconstructSectionObjects: vi.fn()
    }

    // Mock ScheduleManagementService
    mockScheduleManagementService = {
      initializeDefaultScheduleIfNeeded: vi.fn().mockResolvedValue(undefined)
    }

    // Spy on console methods
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Create coordinator instance
    coordinator = new CourseDataCoordinator(
      mockCourseDataService,
      mockTimestampManager,
      mockCourseSelectionService,
      mockScheduleManagementService
    )
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  describe('Constructor', () => {
    it('should initialize with empty consumer lists', () => {
      expect(coordinator).toBeDefined()
      expect(coordinator.isLoaded()).toBe(false)
      expect(coordinator.getDepartments()).toEqual([])
      expect(coordinator.getScheduleDB()).toBeNull()
    })
  })

  describe('Consumer Registration', () => {
    it('should register department consumers', () => {
      const consumer1 = vi.fn()
      const consumer2 = vi.fn()

      coordinator.registerDepartmentConsumer(consumer1)
      coordinator.registerDepartmentConsumer(consumer2)

      // Consumers will be verified during distribution
      expect(coordinator).toBeDefined()
    })

    it('should register catalog consumers', () => {
      const consumer1 = vi.fn()
      const consumer2 = vi.fn()

      coordinator.registerCatalogConsumer(consumer1)
      coordinator.registerCatalogConsumer(consumer2)

      // Consumers will be verified during distribution
      expect(coordinator).toBeDefined()
    })

    it('should register multiple consumers of different types', () => {
      const deptConsumer1 = vi.fn()
      const deptConsumer2 = vi.fn()
      const catalogConsumer1 = vi.fn()
      const catalogConsumer2 = vi.fn()

      coordinator.registerDepartmentConsumer(deptConsumer1)
      coordinator.registerDepartmentConsumer(deptConsumer2)
      coordinator.registerCatalogConsumer(catalogConsumer1)
      coordinator.registerCatalogConsumer(catalogConsumer2)

      expect(coordinator).toBeDefined()
    })
  })

  describe('loadAndDistribute', () => {
    it('should successfully load and distribute data to all consumers', async () => {
      const deptConsumer1 = vi.fn()
      const deptConsumer2 = vi.fn()
      const catalogConsumer1 = vi.fn()
      const catalogConsumer2 = vi.fn()

      coordinator.registerDepartmentConsumer(deptConsumer1)
      coordinator.registerDepartmentConsumer(deptConsumer2)
      coordinator.registerCatalogConsumer(catalogConsumer1)
      coordinator.registerCatalogConsumer(catalogConsumer2)

      const result = await coordinator.loadAndDistribute()

      // Verify result
      expect(result.success).toBe(true)
      expect(result.departments).toBeDefined()
      expect(result.departments?.length).toBe(2)
      expect(result.scheduleDB).toBeDefined()
      expect(result.serverTimestamp).toBe('2025-11-29T12:00:00Z')
      expect(result.error).toBeUndefined()

      // Verify department consumers were called
      expect(deptConsumer1).toHaveBeenCalledTimes(1)
      expect(deptConsumer1).toHaveBeenCalledWith(result.departments)
      expect(deptConsumer2).toHaveBeenCalledTimes(1)
      expect(deptConsumer2).toHaveBeenCalledWith(result.departments)

      // Verify catalog consumers were called
      expect(catalogConsumer1).toHaveBeenCalledTimes(1)
      expect(catalogConsumer1).toHaveBeenCalledWith(result.departments)
      expect(catalogConsumer2).toHaveBeenCalledTimes(1)
      expect(catalogConsumer2).toHaveBeenCalledWith(result.departments)

      // Verify post-distribution operations
      expect(mockCourseSelectionService.reconstructSectionObjects).toHaveBeenCalledTimes(1)
      expect(mockScheduleManagementService.initializeDefaultScheduleIfNeeded).toHaveBeenCalledTimes(1)
      expect(mockTimestampManager.updateClientTimestamp).toHaveBeenCalledTimes(1)
      expect(mockTimestampManager.loadServerTimestamp).toHaveBeenCalledTimes(1)

      // Verify state is marked as loaded
      expect(coordinator.isLoaded()).toBe(true)
    })

    it('should handle load errors gracefully', async () => {
      mockCourseDataService.loadCourseData.mockRejectedValue(
        new Error('Network error')
      )

      const result = await coordinator.loadAndDistribute()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
      expect(result.departments).toBeUndefined()
      expect(result.scheduleDB).toBeUndefined()
      expect(result.serverTimestamp).toBeUndefined()

      // Verify state is not marked as loaded
      expect(coordinator.isLoaded()).toBe(false)
    })

    it('should handle errors from CourseDataService', async () => {
      mockCourseDataService.loadCourseData.mockRejectedValue(
        new Error('Failed to fetch course data')
      )

      const result = await coordinator.loadAndDistribute()

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to fetch course data')
    })

    it('should handle errors from TimestampManager', async () => {
      mockTimestampManager.loadServerTimestamp.mockRejectedValue(
        new Error('Timestamp error')
      )

      const deptConsumer = vi.fn()
      coordinator.registerDepartmentConsumer(deptConsumer)

      // Should still succeed even if timestamp loading fails
      const result = await coordinator.loadAndDistribute()

      expect(result.success).toBe(false)
      expect(result.error).toContain('Timestamp error')
    })

    it('should work with no registered consumers', async () => {
      const result = await coordinator.loadAndDistribute()

      expect(result.success).toBe(true)
      expect(result.departments).toBeDefined()
      expect(result.scheduleDB).toBeDefined()
    })

    it('should call consumers in correct order', async () => {
      const callOrder: string[] = []

      const deptConsumer = vi.fn(() => callOrder.push('dept'))
      const catalogConsumer = vi.fn(() => callOrder.push('catalog'))

      coordinator.registerDepartmentConsumer(deptConsumer)
      coordinator.registerCatalogConsumer(catalogConsumer)

      await coordinator.loadAndDistribute()

      // Department consumers should be called before catalog consumers
      expect(callOrder).toEqual(['dept', 'catalog'])
    })
  })

  describe('redistributeToConsumers', () => {
    it('should redistribute to all consumers after load', async () => {
      const deptConsumer = vi.fn()
      const catalogConsumer = vi.fn()

      coordinator.registerDepartmentConsumer(deptConsumer)
      coordinator.registerCatalogConsumer(catalogConsumer)

      await coordinator.loadAndDistribute()

      // Clear previous calls
      deptConsumer.mockClear()
      catalogConsumer.mockClear()

      // Redistribute
      coordinator.redistributeToConsumers()

      expect(deptConsumer).toHaveBeenCalledTimes(1)
      expect(catalogConsumer).toHaveBeenCalledTimes(1)
    })

    it('should warn if redistributing before load', () => {
      coordinator.redistributeToConsumers()

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[CourseDataCoordinator] Cannot redistribute - data not loaded yet'
      )
    })

    it('should not call consumers if data not loaded', () => {
      const deptConsumer = vi.fn()
      const catalogConsumer = vi.fn()

      coordinator.registerDepartmentConsumer(deptConsumer)
      coordinator.registerCatalogConsumer(catalogConsumer)

      coordinator.redistributeToConsumers()

      expect(deptConsumer).not.toHaveBeenCalled()
      expect(catalogConsumer).not.toHaveBeenCalled()
    })

    it('should redistribute with same data as initial load', async () => {
      let deptData1: Department[] | undefined
      let deptData2: Department[] | undefined

      const deptConsumer = vi.fn((depts: Department[]) => {
        if (deptData1 === undefined) {
          deptData1 = depts
        } else {
          deptData2 = depts
        }
      })

      coordinator.registerDepartmentConsumer(deptConsumer)

      await coordinator.loadAndDistribute()
      coordinator.redistributeToConsumers()

      expect(deptData1).toBeDefined()
      expect(deptData2).toBeDefined()
      expect(deptData1).toEqual(deptData2)
    })

    it('should log redistribution count', async () => {
      const deptConsumer1 = vi.fn()
      const deptConsumer2 = vi.fn()
      const catalogConsumer1 = vi.fn()

      coordinator.registerDepartmentConsumer(deptConsumer1)
      coordinator.registerDepartmentConsumer(deptConsumer2)
      coordinator.registerCatalogConsumer(catalogConsumer1)

      await coordinator.loadAndDistribute()

      consoleSpy.mockClear()

      coordinator.redistributeToConsumers()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Redistributed to 3 consumers')
      )
    })
  })

  describe('State Accessors', () => {
    it('should return empty array for getDepartments before load', () => {
      const departments = coordinator.getDepartments()
      expect(departments).toEqual([])
    })

    it('should return null for getScheduleDB before load', () => {
      const scheduleDB = coordinator.getScheduleDB()
      expect(scheduleDB).toBeNull()
    })

    it('should return false for isLoaded before load', () => {
      const loaded = coordinator.isLoaded()
      expect(loaded).toBe(false)
    })

    it('should return departments after load', async () => {
      await coordinator.loadAndDistribute()

      const departments = coordinator.getDepartments()
      expect(departments).toBeDefined()
      expect(departments.length).toBe(2)
      expect(departments[0].abbreviation).toBe('CS')
      expect(departments[1].abbreviation).toBe('MA')
    })

    it('should return scheduleDB after load', async () => {
      await coordinator.loadAndDistribute()

      const scheduleDB = coordinator.getScheduleDB()
      expect(scheduleDB).toBeDefined()
      expect(scheduleDB?.departments).toBeDefined()
      expect(scheduleDB?.departments.length).toBe(2)
    })

    it('should return true for isLoaded after load', async () => {
      await coordinator.loadAndDistribute()

      const loaded = coordinator.isLoaded()
      expect(loaded).toBe(true)
    })
  })

  describe('Timestamp Management', () => {
    it('should get server timestamp', async () => {
      const timestamp = await coordinator.getServerTimestamp()
      expect(timestamp).toBe('2025-11-29T12:00:00Z')
      expect(mockTimestampManager.loadServerTimestamp).toHaveBeenCalledTimes(1)
    })

    it('should get client timestamp', () => {
      const timestamp = coordinator.getClientTimestamp()
      expect(timestamp).toBeDefined()
      expect(typeof timestamp).toBe('string')
      // Should be valid ISO date string
      expect(new Date(timestamp).toISOString()).toBe(timestamp)
    })
  })

  describe('Integration Scenarios', () => {
    it('should simulate cloud sync redistribution', async () => {
      // Setup consumers
      const searchService = { setCourseData: vi.fn() }
      const filterModal = { setCourseData: vi.fn() }
      const stateManager = { setCourseData: vi.fn() }

      coordinator.registerCatalogConsumer((depts) => searchService.setCourseData(depts))
      coordinator.registerCatalogConsumer((depts) => filterModal.setCourseData(depts))
      coordinator.registerCatalogConsumer((depts) => stateManager.setCourseData(depts))

      // Initial load
      await coordinator.loadAndDistribute()

      expect(searchService.setCourseData).toHaveBeenCalledTimes(1)
      expect(filterModal.setCourseData).toHaveBeenCalledTimes(1)
      expect(stateManager.setCourseData).toHaveBeenCalledTimes(1)

      // Simulate cloud sync - clear call counts
      searchService.setCourseData.mockClear()
      filterModal.setCourseData.mockClear()
      stateManager.setCourseData.mockClear()

      // Redistribute after cloud import
      coordinator.redistributeToConsumers()

      // All consumers should be called again
      expect(searchService.setCourseData).toHaveBeenCalledTimes(1)
      expect(filterModal.setCourseData).toHaveBeenCalledTimes(1)
      expect(stateManager.setCourseData).toHaveBeenCalledTimes(1)
    })

    it('should handle multiple redistribution calls', async () => {
      const consumer = vi.fn()
      coordinator.registerDepartmentConsumer(consumer)

      await coordinator.loadAndDistribute()

      consumer.mockClear()

      // Multiple redistributions
      coordinator.redistributeToConsumers()
      coordinator.redistributeToConsumers()
      coordinator.redistributeToConsumers()

      expect(consumer).toHaveBeenCalledTimes(3)
    })
  })

  describe('Error Recovery', () => {
    it('should allow retry after failed load', async () => {
      // First attempt fails
      mockCourseDataService.loadCourseData.mockRejectedValueOnce(
        new Error('Network error')
      )

      const result1 = await coordinator.loadAndDistribute()
      expect(result1.success).toBe(false)
      expect(coordinator.isLoaded()).toBe(false)

      // Second attempt succeeds
      const mockScheduleDB = createMockScheduleDB()
      mockCourseDataService.loadCourseData.mockResolvedValueOnce(mockScheduleDB)

      const result2 = await coordinator.loadAndDistribute()
      expect(result2.success).toBe(true)
      expect(coordinator.isLoaded()).toBe(true)
    })

    it('should maintain consumer registrations across failed loads', async () => {
      const consumer = vi.fn()
      coordinator.registerDepartmentConsumer(consumer)

      // Failed load
      mockCourseDataService.loadCourseData.mockRejectedValueOnce(
        new Error('Error')
      )
      await coordinator.loadAndDistribute()

      expect(consumer).not.toHaveBeenCalled()

      // Successful load
      const mockScheduleDB = createMockScheduleDB()
      mockCourseDataService.loadCourseData.mockResolvedValueOnce(mockScheduleDB)
      await coordinator.loadAndDistribute()

      expect(consumer).toHaveBeenCalledTimes(1)
    })
  })
})
