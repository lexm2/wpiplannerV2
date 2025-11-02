/**
 * Integration tests for storage persistence
 *
 * These tests verify that critical operations (schedule deletion, course selection,
 * section selection) persist correctly even if the page is reloaded immediately
 * after the operation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProfileStateManager } from '../../src/core/ProfileStateManager';
import { TransactionalStorageManager } from '../../src/core/TransactionalStorageManager';
import { ScheduleManagementService } from '../../src/services/ScheduleManagementService';
import { CourseSelectionService } from '../../src/services/CourseSelectionService';
import type { Course } from '../../src/types/Course';

describe('Storage Persistence Integration Tests', () => {
    let storageManager: TransactionalStorageManager;
    let profileStateManager: ProfileStateManager;
    let scheduleManagementService: ScheduleManagementService;
    let courseSelectionService: CourseSelectionService;

    // Mock localStorage
    const mockLocalStorage: { [key: string]: string } = {};

    beforeEach(() => {
        // Clear all mocks and storage
        vi.clearAllMocks();
        Object.keys(mockLocalStorage).forEach(key => delete mockLocalStorage[key]);

        // Mock localStorage
        global.localStorage = {
            getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
            setItem: vi.fn((key: string, value: string) => {
                mockLocalStorage[key] = value;
            }),
            removeItem: vi.fn((key: string) => {
                delete mockLocalStorage[key];
            }),
            clear: vi.fn(() => {
                Object.keys(mockLocalStorage).forEach(key => delete mockLocalStorage[key]);
            }),
            length: 0,
            key: vi.fn()
        } as Storage;

        // Initialize services (they're not singletons, just regular classes with dependency injection)
        storageManager = new TransactionalStorageManager();
        profileStateManager = new ProfileStateManager();
        courseSelectionService = new CourseSelectionService(profileStateManager);
        scheduleManagementService = new ScheduleManagementService(
            profileStateManager,
            courseSelectionService
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Schedule Deletion Persistence', () => {
        it('should persist schedule deletion even with immediate reload', async () => {
            // Get initial schedule count
            const initialSchedules = profileStateManager.getAllSchedules();
            const initialCount = initialSchedules.length;

            // Create a schedule
            const createResult = await scheduleManagementService.createNewSchedule('Test Schedule');

            expect(createResult.success).toBe(true);
            const scheduleId = createResult.schedule?.id;
            expect(scheduleId).toBeDefined();

            // Verify schedule was created
            let schedules = profileStateManager.getAllSchedules();
            expect(schedules).toHaveLength(initialCount + 1);

            // Delete the new schedule
            const deleteResult = await scheduleManagementService.deleteSchedule(scheduleId!);
            expect(deleteResult.success).toBe(true);

            // CRITICAL: Simulate immediate page reload by creating a new ProfileStateManager instance
            // This mimics what happens when the user reloads the page - it reads from localStorage
            const newProfileStateManager = new ProfileStateManager();
            await newProfileStateManager.loadFromStorage();

            // Verify schedule is gone after "reload" - back to initial count
            schedules = newProfileStateManager.getAllSchedules();
            expect(schedules).toHaveLength(initialCount);
            // Verify our test schedule is not in the list
            expect(schedules.find(s => s.id === scheduleId)).toBeUndefined();
        });

        it('should persist deletion of multiple schedules', async () => {
            // Create 3 schedules
            const schedule1 = await scheduleManagementService.createNewSchedule('Schedule 1');
            const schedule2 = await scheduleManagementService.createNewSchedule('Schedule 2');
            const schedule3 = await scheduleManagementService.createNewSchedule('Schedule 3');

            expect(schedule1.success && schedule2.success && schedule3.success).toBe(true);

            // Delete schedule 2
            await scheduleManagementService.deleteSchedule(schedule2.schedule!.id);

            // Simulate reload
            const newProfileStateManager = new ProfileStateManager();
            await newProfileStateManager.loadFromStorage();

            // Verify only schedules 1 and 3 remain
            const schedules = newProfileStateManager.getAllSchedules();
            expect(schedules).toHaveLength(2);
            expect(schedules.map(s => s.name).sort()).toEqual(['Schedule 1', 'Schedule 3']);
        });

        it('should handle rapid delete operations without data loss', async () => {
            // Create 5 schedules
            const scheduleIds: string[] = [];
            for (let i = 1; i <= 5; i++) {
                const result = await scheduleManagementService.createNewSchedule(`Schedule ${i}`);
                scheduleIds.push(result.schedule!.id);
            }

            // Rapidly delete schedules 2, 3, and 4 (no waiting between deletes)
            await Promise.all([
                scheduleManagementService.deleteSchedule(scheduleIds[1]),
                scheduleManagementService.deleteSchedule(scheduleIds[2]),
                scheduleManagementService.deleteSchedule(scheduleIds[3])
            ]);

            // Simulate reload
            const newProfileStateManager = new ProfileStateManager();
            await newProfileStateManager.loadFromStorage();

            // Verify only schedules 1 and 5 remain
            const schedules = newProfileStateManager.getAllSchedules();
            expect(schedules).toHaveLength(2);
            expect(schedules.map(s => s.name).sort()).toEqual(['Schedule 1', 'Schedule 5']);
        });
    });

    describe('Course Selection Persistence', () => {
        const mockCourse: Course = {
            id: 'CS-2102',
            code: 'CS 2102',
            title: 'Object-Oriented Design Concepts',
            description: 'Introduction to object-oriented design',
            credits: 3,
            termsOffered: ['Fall', 'Spring'],
            prerequisites: [],
            corequisites: [],
            sections: [
                {
                    id: 'CS-2102-A01',
                    courseId: 'CS-2102',
                    sectionCode: 'A01',
                    instructor: 'Prof. Smith',
                    meetings: [
                        {
                            days: ['Monday', 'Wednesday'],
                            startTime: '10:00',
                            endTime: '11:50',
                            location: 'FL 320'
                        }
                    ],
                    capacity: 30,
                    enrolled: 25,
                    status: 'Open'
                }
            ]
        };

        it('should persist course selection even with immediate reload', async () => {
            // Select a course with immediate flush
            const selectResult = await courseSelectionService.selectCourse(mockCourse, { flushImmediately: true });
            expect(selectResult.success).toBe(true);

            // Verify course is selected
            let selectedCourses = courseSelectionService.getSelectedCourses();
            expect(selectedCourses).toHaveLength(1);
            expect(selectedCourses[0].id).toBe(mockCourse.id);

            // Simulate immediate reload
            const newProfileStateManager = new ProfileStateManager();
            await newProfileStateManager.loadFromStorage();
            const newCourseSelectionService = new CourseSelectionService(newProfileStateManager);

            // Verify course is still selected after "reload"
            selectedCourses = newCourseSelectionService.getSelectedCourses();
            expect(selectedCourses).toHaveLength(1);
            expect(selectedCourses[0].id).toBe(mockCourse.id);
        });

        it('should persist multiple rapid course selections', async () => {
            const courses: Course[] = [
                { ...mockCourse, id: 'CS-2102', code: 'CS 2102' },
                { ...mockCourse, id: 'CS-3431', code: 'CS 3431', title: 'Database Systems' },
                { ...mockCourse, id: 'CS-4241', code: 'CS 4241', title: 'Webware' }
            ];

            // Rapidly select all courses
            for (const course of courses) {
                await courseSelectionService.selectCourse(course, {});
            }

            // Flush pending operations before reload
            await courseSelectionService.flushPendingOperations();

            // Simulate reload
            const newProfileStateManager = new ProfileStateManager();
            await newProfileStateManager.loadFromStorage();
            const newCourseSelectionService = new CourseSelectionService(newProfileStateManager);

            // Verify all courses are still selected
            const selectedCourses = newCourseSelectionService.getSelectedCourses();
            expect(selectedCourses).toHaveLength(3);
            expect(selectedCourses.map((c: Course) => c.id).sort()).toEqual(['CS-2102', 'CS-3431', 'CS-4241']);
        });

        it('should persist course unselection', async () => {
            // Select a course
            await courseSelectionService.selectCourse(mockCourse, {});

            // Verify selected
            let selectedCourses = courseSelectionService.getSelectedCourses();
            expect(selectedCourses).toHaveLength(1);

            // Unselect the course
            const unselectResult = await courseSelectionService.unselectCourse(mockCourse.id);
            expect(unselectResult.success).toBe(true);

            // Flush before reload
            await courseSelectionService.flushPendingOperations();

            // Simulate reload
            const newProfileStateManager = new ProfileStateManager();
            await newProfileStateManager.loadFromStorage();
            const newCourseSelectionService = new CourseSelectionService(newProfileStateManager);

            // Verify course is no longer selected
            selectedCourses = newCourseSelectionService.getSelectedCourses();
            expect(selectedCourses).toHaveLength(0);
        });
    });

    describe('Section Selection Persistence', () => {
        const mockCourse: Course = {
            id: 'CS-2102',
            code: 'CS 2102',
            title: 'Object-Oriented Design Concepts',
            description: 'Introduction to object-oriented design',
            credits: 3,
            termsOffered: ['Fall', 'Spring'],
            prerequisites: [],
            corequisites: [],
            sections: [
                {
                    id: 'CS-2102-A01',
                    courseId: 'CS-2102',
                    sectionCode: 'A01',
                    instructor: 'Prof. Smith',
                    meetings: [
                        {
                            days: ['Monday', 'Wednesday'],
                            startTime: '10:00',
                            endTime: '11:50',
                            location: 'FL 320'
                        }
                    ],
                    capacity: 30,
                    enrolled: 25,
                    status: 'Open'
                },
                {
                    id: 'CS-2102-B01',
                    courseId: 'CS-2102',
                    sectionCode: 'B01',
                    instructor: 'Prof. Johnson',
                    meetings: [
                        {
                            days: ['Tuesday', 'Thursday'],
                            startTime: '14:00',
                            endTime: '15:50',
                            location: 'FL 221'
                        }
                    ],
                    capacity: 30,
                    enrolled: 20,
                    status: 'Open'
                }
            ]
        };

        it('should persist section selection even with immediate reload', async () => {
            // Select course first
            await courseSelectionService.selectCourse(mockCourse, {});

            // Select a specific section with immediate flush
            const sectionResult = await courseSelectionService.setSelectedSection(
                mockCourse,
                mockCourse.sections[0].id,
                { flushImmediately: true }
            );
            expect(sectionResult.success).toBe(true);

            // Simulate reload
            const newProfileStateManager = new ProfileStateManager();
            await newProfileStateManager.loadFromStorage();
            const newCourseSelectionService = new CourseSelectionService(newProfileStateManager);

            // Verify section is still selected
            const selectedCourses = newCourseSelectionService.getSelectedCourses();
            const course = selectedCourses.find((c: Course) => c.id === mockCourse.id);
            expect(course).toBeDefined();
            expect(course.selectedSectionId).toBe(mockCourse.sections[0].id);
        });

        it('should persist section change', async () => {
            // Select course
            await courseSelectionService.selectCourse(mockCourse, {});

            // Select section A01
            await courseSelectionService.setSelectedSection(mockCourse, mockCourse.sections[0].id);

            // Change to section B01 with immediate flush
            const changeResult = await courseSelectionService.setSelectedSection(
                mockCourse,
                mockCourse.sections[1].id,
                { flushImmediately: true }
            );
            expect(changeResult.success).toBe(true);

            // Simulate reload
            const newProfileStateManager = new ProfileStateManager();
            await newProfileStateManager.loadFromStorage();
            const newCourseSelectionService = new CourseSelectionService(newProfileStateManager);

            // Verify section B01 is selected (not A01)
            const selectedCourses = newCourseSelectionService.getSelectedCourses();
            const course = selectedCourses.find((c: Course) => c.id === mockCourse.id);
            expect(course?.selectedSectionId).toBe(mockCourse.sections[1].id);
        });
    });

    describe('Batch Queue Flushing', () => {
        it('should flush pending batch operations before critical saves', async () => {
            // This test verifies that BatchOperationManager flushes pending operations
            // before critical saves happen

            // Create a schedule
            const createResult = await scheduleManagementService.createNewSchedule('Batch Test');

            const scheduleId = createResult.schedule!.id;

            // Delete immediately (batch should flush before returning)
            const deleteStart = Date.now();
            await scheduleManagementService.deleteSchedule(scheduleId);
            const deleteEnd = Date.now();

            // Deletion should complete quickly (< 100ms) because it flushes immediately
            // not waiting for 2.5 second batch interval
            expect(deleteEnd - deleteStart).toBeLessThan(100);

            // Verify persistence
            const newProfileStateManager = new ProfileStateManager();
            await newProfileStateManager.loadFromStorage();
            const schedules = newProfileStateManager.getAllSchedules();
            expect(schedules).toHaveLength(0);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty storage gracefully', async () => {
            // Clear all storage
            localStorage.clear();

            // Load from empty storage
            const newProfileStateManager = new ProfileStateManager();
            await newProfileStateManager.loadFromStorage();

            const schedules = newProfileStateManager.getAllSchedules();
            expect(schedules).toHaveLength(0);
        });

        it('should handle corrupted storage data', async () => {
            // Set invalid JSON in storage
            localStorage.setItem('wpi-planner-schedules', 'invalid{json}');

            // Should handle gracefully
            const newProfileStateManager = new ProfileStateManager();
            await expect(newProfileStateManager.loadFromStorage()).resolves.not.toThrow();
        });

        it('should handle concurrent modifications', async () => {
            const course1: Course = {
                id: 'CS-2102',
                code: 'CS 2102',
                title: 'OOD',
                description: 'Test',
                credits: 3,
                termsOffered: ['Fall'],
                prerequisites: [],
                corequisites: [],
                sections: []
            };

            const course2: Course = {
                id: 'CS-3431',
                code: 'CS 3431',
                title: 'Database',
                description: 'Test',
                credits: 3,
                termsOffered: ['Fall'],
                prerequisites: [],
                corequisites: [],
                sections: []
            };

            // Concurrent operations
            await Promise.all([
                courseSelectionService.selectCourse(course1, {}),
                courseSelectionService.selectCourse(course2, {})
            ]);

            // Flush before reload
            await courseSelectionService.flushPendingOperations();

            // Simulate reload
            const newProfileStateManager = new ProfileStateManager();
            await newProfileStateManager.loadFromStorage();
            const newCourseSelectionService = new CourseSelectionService(newProfileStateManager);

            // Both should be persisted
            const selectedCourses = newCourseSelectionService.getSelectedCourses();
            expect(selectedCourses).toHaveLength(2);
        });
    });
});
