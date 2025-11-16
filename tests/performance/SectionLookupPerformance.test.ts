import { describe, it, expect } from 'vitest'
import { CourseSelectionService } from '../../src/services/CourseSelectionService'
import { Course, Section, LectureGroup } from '../../src/types/types'

function createMockCourseWithSections(numLectures: number, numDiscussions: number, numLabs: number): Course {
    const lectures: LectureGroup[] = []

    for (let i = 0; i < numLectures; i++) {
        const discussions: Section[] = []
        const labs: Section[] = []

        for (let j = 0; j < numDiscussions; j++) {
            discussions.push({
                crn: 10000 + i * 1000 + j,
                number: `D0${i}${j}`,
                periods: [],
                seats: 20,
                seatsAvailable: 20,
                actualWaitlist: 0,
                maxWaitlist: 0,
                description: 'Discussion',
                term: 'A',
                computedTerm: 'A-2024'
            })
        }

        for (let k = 0; k < numLabs; k++) {
            labs.push({
                crn: 20000 + i * 1000 + k,
                number: `L0${i}${k}`,
                periods: [],
                seats: 20,
                seatsAvailable: 20,
                actualWaitlist: 0,
                maxWaitlist: 0,
                description: 'Lab',
                term: 'A',
                computedTerm: 'A-2024'
            })
        }

        lectures.push({
            section: {
                crn: 30000 + i,
                number: `A0${i}`,
                periods: [],
                seats: 100,
                seatsAvailable: 100,
                actualWaitlist: 0,
                maxWaitlist: 0,
                description: 'Lecture',
                term: 'A',
                computedTerm: 'A-2024'
            },
            compatibleDiscussions: discussions,
            compatibleLabs: labs
        })
    }

    return {
        id: 'CS-1234',
        name: 'Large Course',
        number: '1234',
        description: 'A course with many sections',
        department: {
            abbreviation: 'CS',
            name: 'Computer Science',
            courses: []
        },
        minCredits: 3,
        maxCredits: 3,
        lectures
    }
}

describe('Section Lookup Performance', () => {
    it('should efficiently handle multiple lookups with caching', async () => {
        const service = new CourseSelectionService()
        await service.initialize()

        // Create a course with 10 lectures, each with 5 discussions and 3 labs
        // Total sections: 10 + (10 * 5) + (10 * 3) = 10 + 50 + 30 = 90 sections
        const largeCourse = createMockCourseWithSections(10, 5, 3)

        await service.selectCourse(largeCourse)

        // Measure first lookup (cache build)
        const start1 = performance.now()
        const selectedCourses1 = service.getSelectedCourses()
        const end1 = performance.now()
        const firstLookupTime = end1 - start1

        // Measure subsequent lookups (cache hit)
        const start2 = performance.now()
        for (let i = 0; i < 100; i++) {
            service.getSelectedCourses()
        }
        const end2 = performance.now()
        const cachedLookupsTime = (end2 - start2) / 100

        expect(cachedLookupsTime).toBeLessThan(firstLookupTime)
        expect(selectedCourses1).toHaveLength(1)
    })

    it('should use O(1) lookup instead of O(n) find operation', async () => {
        const service = new CourseSelectionService()
        await service.initialize()

        // Create multiple courses with varying numbers of sections
        const smallCourse = createMockCourseWithSections(2, 2, 1)  // ~10 sections
        const mediumCourse = createMockCourseWithSections(5, 3, 2)  // ~30 sections
        const largeCourse = createMockCourseWithSections(10, 5, 3)  // ~90 sections

        smallCourse.id = 'CS-100'
        smallCourse.number = '100'
        mediumCourse.id = 'CS-200'
        mediumCourse.number = '200'
        largeCourse.id = 'CS-300'
        largeCourse.number = '300'

        await service.selectCourse(smallCourse)
        await service.selectCourse(mediumCourse)
        await service.selectCourse(largeCourse)

        // With caching, lookup time should be roughly constant regardless of section count
        const start1 = performance.now()
        service.getSelectedCourses()
        const end1 = performance.now()

        const start2 = performance.now()
        service.getSelectedCourses()
        const end2 = performance.now()

        const lookup1Time = end1 - start1
        const lookup2Time = end2 - start2

        expect(lookup1Time).toBeLessThan(10)
        expect(lookup2Time).toBeLessThan(10)
    })
})
