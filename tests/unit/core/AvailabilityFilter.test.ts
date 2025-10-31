import { describe, test, expect, beforeEach } from 'vitest'
import { AvailabilityFilter } from '../../../src/core/filters/AvailabilityFilter'
import {
  createMockCourse,
  createMockSection
} from '../../helpers/mockData'

describe('AvailabilityFilter', () => {
  let availabilityFilter: AvailabilityFilter

  beforeEach(() => {
    availabilityFilter = new AvailabilityFilter()
  })

  describe('constructor', () => {
    test('should create filter with correct properties', () => {
      expect(availabilityFilter.id).toBe('availability')
      expect(availabilityFilter.name).toBe('Availability')
      expect(availabilityFilter.description).toBe('Show only courses with available seats')
    })
  })

  describe('isValidCriteria', () => {
    test('should validate correct criteria', () => {
      expect(availabilityFilter.isValidCriteria({ availableOnly: true })).toBe(true)
      expect(availabilityFilter.isValidCriteria({ availableOnly: false })).toBe(true)
    })

    test('should reject invalid criteria', () => {
      expect(availabilityFilter.isValidCriteria(null)).toBeFalsy()
      expect(availabilityFilter.isValidCriteria(undefined)).toBeFalsy()
      expect(availabilityFilter.isValidCriteria({})).toBeFalsy()
      expect(availabilityFilter.isValidCriteria({ availableOnly: 'true' })).toBeFalsy()
      expect(availabilityFilter.isValidCriteria({ availableOnly: 1 })).toBeFalsy()
    })
  })

  describe('getDisplayValue', () => {
    test('should return correct display values', () => {
      expect(availabilityFilter.getDisplayValue({ availableOnly: true }))
        .toBe('Available seats only')
      expect(availabilityFilter.getDisplayValue({ availableOnly: false }))
        .toBe('All courses')
    })
  })

  describe('basic availability filtering', () => {
    test('should return all courses when filter is disabled', () => {
      const courses = [
        createMockCourse({
          id: 'CS-101',
          sections: [createMockSection({ seatsAvailable: 0 })]
        }),
        createMockCourse({
          id: 'CS-102',
          sections: [createMockSection({ seatsAvailable: 5 })]
        })
      ]

      const result = availabilityFilter.apply(courses, { availableOnly: false })
      expect(result).toHaveLength(2)
      expect(result).toEqual(courses)
    })

    test('should filter out courses with no available seats', () => {
      const courses = [
        createMockCourse({
          id: 'CS-101',
          sections: [createMockSection({ seatsAvailable: 0 })]
        }),
        createMockCourse({
          id: 'CS-102',
          sections: [createMockSection({ seatsAvailable: 5 })]
        })
      ]

      const result = availabilityFilter.apply(courses, { availableOnly: true })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('CS-102')
    })

    test('should include courses with at least one available section', () => {
      const courses = [
        createMockCourse({
          id: 'CS-101',
          sections: [
            createMockSection({ number: 'A01', seatsAvailable: 0 }),
            createMockSection({ number: 'A02', seatsAvailable: 3 })
          ]
        })
      ]

      const result = availabilityFilter.apply(courses, { availableOnly: true })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('CS-101')
    })

    test('should handle empty course list', () => {
      const result = availabilityFilter.apply([], { availableOnly: true })
      expect(result).toEqual([])
    })

    test('should handle courses with no sections', () => {
      const course = createMockCourse({
        id: 'CS-101',
        sections: []
      })

      const result = availabilityFilter.apply([course], { availableOnly: true })
      expect(result).toHaveLength(0)
    })
  })

  describe('term filter integration', () => {
    test('should work without term filter', () => {
      const courses = [
        createMockCourse({
          id: 'CS-101',
          sections: [createMockSection({ seatsAvailable: 5 })]
        }),
        createMockCourse({
          id: 'CS-102',
          sections: [createMockSection({ seatsAvailable: 3 })]
        })
      ]

      const result = availabilityFilter.apply(courses, { availableOnly: true })
      expect(result).toHaveLength(2)
    })

    test('should respect active term filters when provided', () => {
      const sectionA = createMockSection({
        number: 'A01',
        computedTerm: 'A',
        seatsAvailable: 5
      })

      const sectionB = createMockSection({
        number: 'B01',
        computedTerm: 'B',
        seatsAvailable: 3
      })

      const course = createMockCourse({
        id: 'CS-101',
        sections: [sectionA, sectionB]
      })

      const activeFilters = new Map()
      activeFilters.set('term', { terms: ['A'] })

      const result = availabilityFilter.apply([course], { availableOnly: true }, activeFilters)

      expect(result).toHaveLength(1) // Course has available section in term A
    })

    test('should filter out courses with no available sections in active terms', () => {
      const sectionA = createMockSection({
        number: 'A01',
        computedTerm: 'A',
        seatsAvailable: 0 // No seats available
      })

      const sectionB = createMockSection({
        number: 'B01',
        computedTerm: 'B',
        seatsAvailable: 5 // Has seats but wrong term
      })

      const course = createMockCourse({
        id: 'CS-101',
        sections: [sectionA, sectionB]
      })

      const activeFilters = new Map()
      activeFilters.set('term', { terms: ['A'] })

      const result = availabilityFilter.apply([course], { availableOnly: true }, activeFilters)

      expect(result).toHaveLength(0) // No available sections in term A
    })

    test('should handle multiple active terms', () => {
      const sectionA = createMockSection({
        number: 'A01',
        computedTerm: 'A',
        seatsAvailable: 5
      })

      const sectionB = createMockSection({
        number: 'B01',
        computedTerm: 'B',
        seatsAvailable: 0
      })

      const sectionC = createMockSection({
        number: 'C01',
        computedTerm: 'C',
        seatsAvailable: 3
      })

      const course1 = createMockCourse({
        id: 'CS-101',
        sections: [sectionA, sectionB]
      })

      const course2 = createMockCourse({
        id: 'CS-102',
        sections: [sectionC]
      })

      const activeFilters = new Map()
      activeFilters.set('term', { terms: ['A', 'C'] })

      const result = availabilityFilter.apply([course1, course2], { availableOnly: true }, activeFilters)

      expect(result).toHaveLength(2) // Both have available sections in A or C terms
    })

    test('should handle undefined activeFilters', () => {
      const course = createMockCourse({
        sections: [createMockSection({ seatsAvailable: 5 })]
      })

      const result = availabilityFilter.apply([course], { availableOnly: true }, undefined)
      expect(result).toHaveLength(1)
    })

    test('should handle Map without term filter', () => {
      const course = createMockCourse({
        sections: [createMockSection({ seatsAvailable: 5 })]
      })

      const activeFilters = new Map()
      // No 'term' key set

      const result = availabilityFilter.apply([course], { availableOnly: true }, activeFilters)
      expect(result).toHaveLength(1)
    })
  })
})
