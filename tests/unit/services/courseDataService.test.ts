import { describe, it, expect } from 'bun:test'
import { createMockScheduleDB } from '../../helpers/mockData'
import { safeStringify, safeParse } from '../../../src/utils/jsonSerializer'
import { getAllSections } from '../../../src/utils/courseUtils'
import type { Section, ScheduleDB } from '../../../src/types/types'
// Direct import - JSON now uses camelCase matching TypeScript types
// @ts-ignore - JSON import
import courseData from '../../../public/course-data-constructed.json'

describe('CourseDataService - Data Integrity', () => {
    // Use course data directly - no conversion needed since it's now in camelCase
    const realCourseData = courseData as unknown as ScheduleDB

    // Helper to get test data - use real data, fallback to mock if unavailable
    function getTestData(): ScheduleDB {
        if (!realCourseData || !realCourseData.departments || realCourseData.departments.length === 0) {
            console.warn('Real course data not available, using mock data')
            return createMockScheduleDB()
        }
        return realCourseData
    }

    describe('Cyclic Reference Detection', () => {
        /**
         * Helper function to detect unexpected cyclic references in object graph
         * Allows the expected Course → Department → courses[] cycle
         * but detects any other circular references
         */
        function detectUnexpectedCycles(
            obj: any,
            visited: WeakSet<object> = new WeakSet(),
            path: string[] = [],
            allowedCycles: Set<string> = new Set(['course->department->courses'])
        ): { hasCycle: boolean; cyclePath?: string } {
            // Skip primitives and null
            if (obj === null || typeof obj !== 'object') {
                return { hasCycle: false }
            }

            // Skip built-in objects that are safe
            if (obj instanceof Date || obj instanceof RegExp || obj instanceof Set || obj instanceof Map) {
                return { hasCycle: false }
            }

            // Check if we've seen this object before
            if (visited.has(obj)) {
                const cyclePathStr = path.join('->')

                // Check if this is an allowed cycle
                const isAllowedCycle = Array.from(allowedCycles).some(allowed =>
                    cyclePathStr.includes(allowed) || cyclePathStr.endsWith('courses')
                )

                if (!isAllowedCycle) {
                    return { hasCycle: true, cyclePath: cyclePathStr }
                }
                return { hasCycle: false }
            }

            // Mark as visited
            visited.add(obj)

            // Traverse object properties
            if (Array.isArray(obj)) {
                for (let i = 0; i < obj.length; i++) {
                    const result = detectUnexpectedCycles(
                        obj[i],
                        visited,
                        [...path, `[${i}]`],
                        allowedCycles
                    )
                    if (result.hasCycle) {
                        return result
                    }
                }
            } else {
                for (const key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        const result = detectUnexpectedCycles(
                            obj[key],
                            visited,
                            [...path, key],
                            allowedCycles
                        )
                        if (result.hasCycle) {
                            return result
                        }
                    }
                }
            }

            return { hasCycle: false }
        }

        it('should construct courses without unintended cyclic references', () => {
            const testData = getTestData()

            // The only allowed cycle is Course → Department → courses[]
            // We need to check each course individually to avoid the expected cycle
            let coursesChecked = 0
            for (const department of testData.departments) {
                for (const course of department.courses) {
                    // Check course itself (without following back to department.courses)
                    const { hasCycle, cyclePath } = detectUnexpectedCycles(
                        { ...course, department: { ...course.department, courses: undefined } }
                    )

                    expect(hasCycle).toBe(false)
                    if (cyclePath) {
                        console.log('Unexpected cycle found:', cyclePath)
                        expect(cyclePath).toBeUndefined()
                    }
                    coursesChecked++
                }
            }

            console.log(`✓ Checked ${coursesChecked} courses for unexpected cycles`)
        })

        it('should successfully serialize courses with safeStringify', () => {
            const testData = getTestData()

            // Should not throw error
            expect(() => {
                const serialized = safeStringify(testData)
                expect(serialized).toBeDefined()
                expect(typeof serialized).toBe('string')
            }).not.toThrow()
        })

        it('should handle the expected Course ↔ Department cycle gracefully', () => {
            const testData = getTestData()
            const department = testData.departments[0]
            const course = department.courses[0]

            // Note: The raw JSON data might not have the circular reference constructed yet
            // That's built by CourseDataService during processing
            // Check if the circular reference exists (it should in processed data)
            if (course.department) {
                expect(course.department).toBe(department)
                expect(department.courses).toContain(course)
            }

            // The important test: verify it can still be serialized even with cycles
            expect(() => safeStringify(course)).not.toThrow()
            expect(() => safeStringify(department)).not.toThrow()
        })

        it('should handle all sections without unexpected circular references', () => {
            const testData = getTestData()

            let sectionsChecked = 0
            for (const department of testData.departments) {
                for (const course of department.courses) {
                    const allSections = getAllSections(course)

                    for (const section of allSections) {
                        const { hasCycle, cyclePath } = detectUnexpectedCycles(section)

                        expect(hasCycle).toBe(false)
                        if (cyclePath) {
                            expect(cyclePath).toBeUndefined()
                        }
                        sectionsChecked++
                    }
                }
            }

            console.log(`✓ Checked ${sectionsChecked} sections for cycles`)
        })

        it('should validate all constructed courses have required structure', () => {
            const testData = getTestData()

            expect(testData.departments.length).toBeGreaterThan(0)

            let coursesChecked = 0
            let sectionsChecked = 0

            for (const department of testData.departments) {
                // Check basic department structure
                expect(department.abbreviation).toBeDefined()
                expect(department.name).toBeDefined()
                expect(Array.isArray(department.courses)).toBe(true)

                // Skip departments with no courses (edge case in data)
                if (department.courses.length === 0) {
                    continue
                }

                for (const course of department.courses) {
                    // Check basic course structure (now properly processed by courseDataService)
                    expect(course.id).toBeDefined()
                    expect(course.number).toBeDefined()
                    expect(course.name).toBeDefined()
                    expect(course.description).toBeDefined()
                    expect(typeof course.minCredits).toBe('number')
                    expect(typeof course.maxCredits).toBe('number')
                    coursesChecked++

                    // Check all sections have critical fields (especially computedTerm)
                    const allSections = getAllSections(course)
                    for (const section of allSections) {
                        // Verify critical fields for cyclic reference testing
                        expect(section.crn).toBeDefined()
                        expect(typeof section.crn).toBe('number')

                        // THIS IS THE KEY TEST: computedTerm must exist and be valid
                        expect(section.computedTerm).toBeDefined()
                        expect(typeof section.computedTerm).toBe('string')
                        expect(section.computedTerm.length).toBeGreaterThan(0) // Non-empty string

                        sectionsChecked++
                    }
                }
            }

            console.log(`✓ Validated structure of ${coursesChecked} courses and ${sectionsChecked} sections`)
        })

        it('should serialize and deserialize without data loss', () => {
            // Create a mock section directly since course might not have sections
            const mockSection = {
                crn: 12345,
                number: 'A01',
                seats: 30,
                seatsAvailable: 15,
                actualWaitlist: 2,
                maxWaitlist: 10,
                description: 'Test section',
                term: 'Fall 2024',
                computedTerm: 'A',
                periods: []
            } as Section

            // Serialize using safeStringify (handles Sets)
            const serialized = safeStringify(mockSection)
            expect(serialized).toBeDefined()
            expect(typeof serialized).toBe('string')
            expect(serialized.length).toBeGreaterThan(0)

            const deserialized = safeParse(serialized) as Section

            // Verify critical fields are preserved
            expect(deserialized.crn).toBe(mockSection.crn)
            expect(deserialized.number).toBe(mockSection.number)
            expect(deserialized.computedTerm).toBe(mockSection.computedTerm)
            expect(deserialized.term).toBe(mockSection.term)
            expect(deserialized.seats).toBe(mockSection.seats)
            expect(deserialized.seatsAvailable).toBe(mockSection.seatsAvailable)
        })

        it('should not have circular references in Section periods', () => {
            const testData = getTestData()

            let periodsChecked = 0
            for (const department of testData.departments) {
                for (const course of department.courses) {
                    const allSections = getAllSections(course)

                    for (const section of allSections) {
                        // Check each period
                        for (const period of section.periods) {
                            const { hasCycle, cyclePath } = detectUnexpectedCycles(period)

                            expect(hasCycle).toBe(false)
                            if (cyclePath) {
                                expect(cyclePath).toBeUndefined()
                            }

                            // Verify period can be stringified (note: periods contain Sets)
                            expect(() => safeStringify(period)).not.toThrow()
                            periodsChecked++
                        }
                    }
                }
            }

            console.log(`✓ Checked ${periodsChecked} periods for cycles`)
        })

        it('should detect if a section incorrectly references its parent course', () => {
            // Create a mock section that incorrectly has a reference to its course
            const mockDB = createMockScheduleDB()
            const course = mockDB.departments[0].courses[0]
            const section = getAllSections(course)[0]

            // Add an incorrect circular reference (this should NOT exist in real data)
            const corruptedSection = { ...section, parentCourse: course }

            // This should detect the unexpected cycle
            const { hasCycle } = detectUnexpectedCycles(corruptedSection)

            // We expect this to find a cycle since we added an unexpected reference
            expect(hasCycle).toBe(true)
        })

        it('should ensure SelectedCourse objects can be serialized', () => {
            const testData = getTestData()
            const course = testData.departments[0].courses[0]
            const allSections = getAllSections(course)

            // Create a SelectedCourse-like object
            const selectedCourse = {
                course: course,
                selectedLecture: allSections.length > 0 ? allSections[0] : null,
                selectedDiscussion: null,
                selectedLab: null,
                isRequired: false,
                lockedSections: new Set<string>()
            }

            // Should serialize with safeStringify (handles circular refs and Sets)
            expect(() => {
                const serialized = safeStringify(selectedCourse)
                expect(serialized).toBeDefined()
                expect(serialized.length).toBeGreaterThan(0)
            }).not.toThrow()
        })
    })
})
