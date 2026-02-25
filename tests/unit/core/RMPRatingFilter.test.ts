import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { RMPRatingFilter } from '../../../src/core/filtering/filters/RMPRatingFilter'
import { RateMyProfessorService } from '../../../src/services/external/RateMyProfessorService'
import { FilterableSection } from '../../../src/types/filterableUnit'
import { SectionType } from '../../../src/types/types'
import {
  createMockCourse,
  createMockSection,
  createMockPeriod
} from '../../helpers/mockData'

describe('RMPRatingFilter - includeWithoutData functionality', () => {
  let rmpFilter: RMPRatingFilter
  let mockRMPService: RateMyProfessorService

  beforeEach(() => {
    // Create mock RMP service
    mockRMPService = {
      getRatingDisplay: mock((professorName: string) => {
        // Mock RMP data - Adam Messer has no RMP data
        if (professorName === 'Adam Messer') {
          return null
        }
        // Other professors have RMP data
        if (professorName === 'Dr. Test Professor') {
          return {
            rating: '4.5',
            difficulty: '2.5',
            wouldTakeAgain: '85'
          }
        }
        return null
      })
    } as any

    rmpFilter = new RMPRatingFilter(mockRMPService)
  })

  test('should filter out professors without RMP data when includeWithoutData is false', () => {
    // Create test data - Team and Leadership Fundamentals III taught by Adam Messer
    const adamMesserSection = createMockSection({
      crn: 10001,
      number: 'A01',
      periods: [
        createMockPeriod({
          professor: 'Adam Messer'
        })
      ]
    })

    const adamMesserCourse = createMockCourse({
      id: 'MIL-1101',
      number: '1101',
      name: 'Team and Leadership Fundamentals III (General Military Course)',
      lectures: [{
        section: adamMesserSection,
        compatibleDiscussions: [],
        compatibleLabs: []
      }]
    })

    // Create another course with RMP data
    const normalSection = createMockSection({
      crn: 10002,
      number: 'A01',
      periods: [
        createMockPeriod({
          professor: 'Dr. Test Professor'
        })
      ]
    })

    const normalCourse = createMockCourse({
      id: 'CS-1101',
      number: '1101',
      name: 'Introduction to Programming',
      lectures: [{
        section: normalSection,
        compatibleDiscussions: [],
        compatibleLabs: []
      }]
    })

    // Convert to FilterableSection format
    const filterableSections: FilterableSection[] = [
      {
        course: adamMesserCourse,
        section: adamMesserSection,
        sectionType: SectionType.LECTURE
      },
      {
        course: normalCourse,
        section: normalSection,
        sectionType: SectionType.LECTURE
      }
    ]

    // Test with includeWithoutData = false (checkbox unchecked)
    const criteria = {
      minRating: 0,
      maxRating: 5,
      minDifficulty: 0,
      maxDifficulty: 5,
      minWouldTakeAgain: 0,
      maxWouldTakeAgain: 100,
      includeWithoutData: false  // UNCHECKED - should filter out Adam Messer
    }

    const result = rmpFilter.apply(filterableSections, criteria)

    // Should only include the course with RMP data
    expect(result).toHaveLength(1)
    expect(result[0].course.name).toBe('Introduction to Programming')
    expect(result[0].section.periods[0].professor).toBe('Dr. Test Professor')

    // Adam Messer's course should be filtered out
    expect(result.find(fs => fs.section.periods[0].professor === 'Adam Messer')).toBeUndefined()
  })

  test('should include professors without RMP data when includeWithoutData is true', () => {
    const adamMesserSection = createMockSection({
      periods: [
        createMockPeriod({
          professor: 'Adam Messer'
        })
      ]
    })

    const adamMesserCourse = createMockCourse({
      id: 'MIL-1101',
      name: 'Team and Leadership Fundamentals III (General Military Course)',
      lectures: [{
        section: adamMesserSection,
        compatibleDiscussions: [],
        compatibleLabs: []
      }]
    })

    const normalSection = createMockSection({
      periods: [
        createMockPeriod({
          professor: 'Dr. Test Professor'
        })
      ]
    })

    const normalCourse = createMockCourse({
      id: 'CS-1101',
      name: 'Introduction to Programming',
      lectures: [{
        section: normalSection,
        compatibleDiscussions: [],
        compatibleLabs: []
      }]
    })

    const filterableSections: FilterableSection[] = [
      {
        course: adamMesserCourse,
        section: adamMesserSection,
        sectionType: SectionType.LECTURE
      },
      {
        course: normalCourse,
        section: normalSection,
        sectionType: SectionType.LECTURE
      }
    ]

    // Test with includeWithoutData = true (checkbox checked - default)
    const criteria = {
      minRating: 0,
      maxRating: 5,
      minDifficulty: 0,
      maxDifficulty: 5,
      minWouldTakeAgain: 0,
      maxWouldTakeAgain: 100,
      includeWithoutData: true  // CHECKED - should include Adam Messer
    }

    const result = rmpFilter.apply(filterableSections, criteria)

    // Should include both courses
    expect(result).toHaveLength(2)
  })

  test('should NOT skip filtering when only includeWithoutData is changed from default', () => {
    const adamMesserSection = createMockSection({
      periods: [
        createMockPeriod({
          professor: 'Adam Messer'
        })
      ]
    })

    const adamMesserCourse = createMockCourse({
      id: 'MIL-1101',
      name: 'Team and Leadership Fundamentals III',
      lectures: [{
        section: adamMesserSection,
        compatibleDiscussions: [],
        compatibleLabs: []
      }]
    })

    const filterableSections: FilterableSection[] = [
      {
        course: adamMesserCourse,
        section: adamMesserSection,
        sectionType: SectionType.LECTURE
      }
    ]

    // All sliders at defaults, but checkbox unchecked
    const criteria = {
      minRating: 0,        // DEFAULT
      maxRating: 5,        // DEFAULT
      minDifficulty: 0,    // DEFAULT
      maxDifficulty: 5,    // DEFAULT
      minWouldTakeAgain: 0,   // DEFAULT
      maxWouldTakeAgain: 100, // DEFAULT
      includeWithoutData: false  // NOT DEFAULT - should trigger filtering
    }

    const result = rmpFilter.apply(filterableSections, criteria)

    // Should filter out Adam Messer even though sliders are at defaults
    expect(result).toHaveLength(0)
  })

  test('should skip filtering when ALL criteria are at defaults including includeWithoutData', () => {
    const adamMesserSection = createMockSection({
      periods: [
        createMockPeriod({
          professor: 'Adam Messer'
        })
      ]
    })

    const adamMesserCourse = createMockCourse({
      id: 'MIL-1101',
      lectures: [{
        section: adamMesserSection,
        compatibleDiscussions: [],
        compatibleLabs: []
      }]
    })

    const filterableSections: FilterableSection[] = [
      {
        course: adamMesserCourse,
        section: adamMesserSection,
        sectionType: SectionType.LECTURE
      }
    ]

    // ALL at defaults
    const criteria = {
      minRating: 0,
      maxRating: 5,
      minDifficulty: 0,
      maxDifficulty: 5,
      minWouldTakeAgain: 0,
      maxWouldTakeAgain: 100,
      includeWithoutData: true  // DEFAULT
    }

    const result = rmpFilter.apply(filterableSections, criteria)

    // Should return all sections without filtering
    expect(result).toHaveLength(1)
    expect(result[0].course.id).toBe('MIL-1101')
  })
})
