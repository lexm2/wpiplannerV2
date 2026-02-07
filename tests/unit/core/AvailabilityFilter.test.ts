import { describe, test, expect, beforeEach } from 'bun:test'
import { AvailabilityFilter } from '../../../src/core/filtering/filters/AvailabilityFilter'
import { AcademicTerm } from '../../../src/types/schedule'
import {
  createMockFilterableSection
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
    test('should return all sections when filter is disabled', () => {
      const sections = [
        createMockFilterableSection({
          section: { seatsAvailable: 0, computedTerm: AcademicTerm.A }
        }),
        createMockFilterableSection({
          section: { seatsAvailable: 5, computedTerm: AcademicTerm.A }
        })
      ]

      const result = availabilityFilter.apply(sections, { availableOnly: false })
      expect(result).toHaveLength(2)
      expect(result).toEqual(sections)
    })

    test('should filter out sections with no available seats', () => {
      const sections = [
        createMockFilterableSection({
          course: { id: 'CS-101' },
          section: { seatsAvailable: 0, computedTerm: AcademicTerm.A }
        }),
        createMockFilterableSection({
          course: { id: 'CS-102' },
          section: { seatsAvailable: 5, computedTerm: AcademicTerm.A }
        })
      ]

      const result = availabilityFilter.apply(sections, { availableOnly: true })
      expect(result).toHaveLength(1)
      expect(result[0].course.id).toBe('CS-102')
    })

    test('should include sections with available seats', () => {
      const sections = [
        createMockFilterableSection({
          course: { id: 'CS-101' },
          section: { number: 'A01', seatsAvailable: 0, computedTerm: AcademicTerm.A }
        }),
        createMockFilterableSection({
          course: { id: 'CS-101' },
          section: { number: 'A02', seatsAvailable: 3, computedTerm: AcademicTerm.A }
        })
      ]

      const result = availabilityFilter.apply(sections, { availableOnly: true })
      expect(result).toHaveLength(1)
      expect(result[0].section.number).toBe('A02')
    })

    test('should handle empty section list', () => {
      const result = availabilityFilter.apply([], { availableOnly: true })
      expect(result).toEqual([])
    })

    test('should handle sections with zero available seats', () => {
      const section = createMockFilterableSection({
        course: { id: 'CS-101' },
        section: { seatsAvailable: 0, computedTerm: AcademicTerm.A }
      })

      const result = availabilityFilter.apply([section], { availableOnly: true })
      expect(result).toHaveLength(0)
    })
  })

  describe('term filter integration', () => {
    test('should work without term filter', () => {
      const sections = [
        createMockFilterableSection({
          course: { id: 'CS-101' },
          section: { seatsAvailable: 5, computedTerm: AcademicTerm.A }
        }),
        createMockFilterableSection({
          course: { id: 'CS-102' },
          section: { seatsAvailable: 3, computedTerm: AcademicTerm.A }
        })
      ]

      const result = availabilityFilter.apply(sections, { availableOnly: true })
      expect(result).toHaveLength(2)
    })

    test('should respect active term filters when provided', () => {
      const sectionA = createMockFilterableSection({
        course: { id: 'CS-101' },
        section: {
          number: 'A01',
          computedTerm: AcademicTerm.A,
          seatsAvailable: 5
        }
      })

      const sectionB = createMockFilterableSection({
        course: { id: 'CS-101' },
        section: {
          number: 'B01',
          computedTerm: AcademicTerm.B,
          seatsAvailable: 3
        }
      })

      const activeFilters = new Map()
      activeFilters.set('term', { terms: ['A'] })

      const result = availabilityFilter.apply([sectionA, sectionB], { availableOnly: true }, activeFilters)

      expect(result).toHaveLength(1)
      expect(result[0].section.computedTerm).toBe(AcademicTerm.A)
    })

    test('should filter out sections with no available seats in active terms', () => {
      const sectionA = createMockFilterableSection({
        course: { id: 'CS-101' },
        section: {
          number: 'A01',
          computedTerm: AcademicTerm.A,
          seatsAvailable: 0
        }
      })

      const sectionB = createMockFilterableSection({
        course: { id: 'CS-101' },
        section: {
          number: 'B01',
          computedTerm: AcademicTerm.B,
          seatsAvailable: 5
        }
      })

      const activeFilters = new Map()
      activeFilters.set('term', { terms: ['A'] })

      const result = availabilityFilter.apply([sectionA, sectionB], { availableOnly: true }, activeFilters)

      expect(result).toHaveLength(0)
    })

    test('should handle multiple active terms', () => {
      const sectionA = createMockFilterableSection({
        course: { id: 'CS-101' },
        section: {
          number: 'A01',
          computedTerm: AcademicTerm.A,
          seatsAvailable: 5
        }
      })

      const sectionB = createMockFilterableSection({
        course: { id: 'CS-101' },
        section: {
          number: 'B01',
          computedTerm: AcademicTerm.B,
          seatsAvailable: 0
        }
      })

      const sectionC = createMockFilterableSection({
        course: { id: 'CS-102' },
        section: {
          number: 'C01',
          computedTerm: AcademicTerm.C,
          seatsAvailable: 3
        }
      })

      const activeFilters = new Map()
      activeFilters.set('term', { terms: ['A', 'C'] })

      const result = availabilityFilter.apply([sectionA, sectionB, sectionC], { availableOnly: true }, activeFilters)

      expect(result).toHaveLength(2)
      expect(result[0].section.computedTerm).toBe(AcademicTerm.A)
      expect(result[1].section.computedTerm).toBe(AcademicTerm.C)
    })

    test('should handle undefined activeFilters', () => {
      const section = createMockFilterableSection({
        section: { seatsAvailable: 5, computedTerm: AcademicTerm.A }
      })

      const result = availabilityFilter.apply([section], { availableOnly: true }, undefined)
      expect(result).toHaveLength(1)
    })

    test('should handle Map without term filter', () => {
      const section = createMockFilterableSection({
        section: { seatsAvailable: 5, computedTerm: AcademicTerm.A }
      })

      const activeFilters = new Map()

      const result = availabilityFilter.apply([section], { availableOnly: true }, activeFilters)
      expect(result).toHaveLength(1)
    })
  })
})
