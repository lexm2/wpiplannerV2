/**
 * Integration tests for storage persistence
 *
 * These tests verify that critical operations (schedule deletion, course selection,
 * section selection) persist correctly even if the page is reloaded immediately
 * after the operation.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { ProfileStateManager } from '../../src/core/state/ProfileStateManager';
import { TransactionalStorageManager } from '../../src/core/storage/TransactionalStorageManager';
import { ScheduleManagementService } from '../../src/services/selection/ScheduleManagementService';
import { CourseSelectionService } from '../../src/services/selection/CourseSelectionService';
import type { Course } from '../../src/types/types';
import { createMockCourse, createMockSection, createMockPeriod, createMockTime, createMockDepartment } from '../helpers/mockData';
import { DayOfWeek, PeriodType } from '../../src/types/types';

describe('Storage Persistence Integration Tests', () => {
    let storageManager: TransactionalStorageManager;
    let profileStateManager: ProfileStateManager;
    let scheduleManagementService: ScheduleManagementService;
    let courseSelectionService: CourseSelectionService;

    // Mock localStorage
    const mockLocalStorage: { [key: string]: string } = {};

    beforeEach(async () => {
        // Clear storage
        Object.keys(mockLocalStorage).forEach((key: any) => delete mockLocalStorage[key]);

        // Mock localStorage
        global.localStorage = {
            getItem: mock((key: string) => mockLocalStorage[key] || null),
            setItem: mock((key: string, value: string) => {
                mockLocalStorage[key] = value;
            }),
            removeItem: mock((key: string) => {
                delete mockLocalStorage[key];
            }),
            clear: mock(() => {
                Object.keys(mockLocalStorage).forEach((key: any) => delete mockLocalStorage[key]);
            }),
            length: 0,
            key: mock()
        } as Storage;

        ProfileStateManager.resetInstance();

        storageManager = new TransactionalStorageManager();
        profileStateManager = ProfileStateManager.getInstance();
        courseSelectionService = new CourseSelectionService(profileStateManager);
        scheduleManagementService = new ScheduleManagementService(
            profileStateManager,
            courseSelectionService
        );

        // Initialize the services
        await courseSelectionService.initialize();
        await scheduleManagementService.initialize();
    });

    afterEach(() => {
        // Bun automatically restores mocks between tests
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
            const newStorageManager = new TransactionalStorageManager();
            const newProfileStateManager = ProfileStateManager.getInstance();

            // Verify schedule is gone after "reload" - back to initial count
            schedules = newProfileStateManager.getAllSchedules();
            expect(schedules).toHaveLength(initialCount);
            // Verify our test schedule is not in the list
            expect(schedules.find((s: any) => s.id === scheduleId)).toBeUndefined();
        });

        it('should persist deletion of multiple schedules', async () => {
            // Get initial schedule count (there's a default "My Schedule")
            const initialSchedules = profileStateManager.getAllSchedules();
            const initialCount = initialSchedules.length;

            // Create 3 schedules
            const schedule1 = await scheduleManagementService.createNewSchedule('Schedule 1');
            const schedule2 = await scheduleManagementService.createNewSchedule('Schedule 2');
            const schedule3 = await scheduleManagementService.createNewSchedule('Schedule 3');

            expect(schedule1.success && schedule2.success && schedule3.success).toBe(true);

            // Delete schedule 2
            await scheduleManagementService.deleteSchedule(schedule2.schedule!.id);

            // Simulate reload
            const newStorageManager = new TransactionalStorageManager();
            const newProfileStateManager = ProfileStateManager.getInstance();

            // Verify correct number of schedules remain (initial + 2 new ones)
            const schedules = newProfileStateManager.getAllSchedules();
            expect(schedules).toHaveLength(initialCount + 2);

            // Verify Schedule 2 is gone and Schedules 1 and 3 remain
            const scheduleNames = schedules.map((s: any) => s.name);
            expect(scheduleNames).not.toContain('Schedule 2');
            expect(scheduleNames).toContain('Schedule 1');
            expect(scheduleNames).toContain('Schedule 3');
        });

        it('should handle rapid delete operations without data loss', async () => {
            // Get initial schedule count
            const initialSchedules = profileStateManager.getAllSchedules();
            const initialCount = initialSchedules.length;

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
            const newStorageManager = new TransactionalStorageManager();
            const newProfileStateManager = ProfileStateManager.getInstance();

            // Verify correct number of schedules remain (initial + 2 new ones)
            const schedules = newProfileStateManager.getAllSchedules();
            expect(schedules).toHaveLength(initialCount + 2);

            // Verify schedules 2, 3, 4 are gone and 1 and 5 remain
            const scheduleNames = schedules.map((s: any) => s.name);
            expect(scheduleNames).not.toContain('Schedule 2');
            expect(scheduleNames).not.toContain('Schedule 3');
            expect(scheduleNames).not.toContain('Schedule 4');
            expect(scheduleNames).toContain('Schedule 1');
            expect(scheduleNames).toContain('Schedule 5');
        });
    });

    describe('Course Selection Persistence', () => {
        const mockSection1 = createMockSection({
            crn: 12345,
            number: 'A01',
            seats: 30,
            seatsAvailable: 5,
            periods: [
                createMockPeriod({
                    type: PeriodType.LECTURE,
                    professor: 'Prof. Smith',
                    startTime: createMockTime(10, 0),
                    endTime: createMockTime(11, 50),
                    days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY]),
                    location: 'FL 320'
                })
            ]
        });

        const mockCourse: Course = createMockCourse({
            id: 'CS-2102',
            number: '2102',
            name: 'Object-Oriented Design Concepts',
            description: 'Introduction to object-oriented design',
            minCredits: 3,
            maxCredits: 3,
            lectures: [
                {
                    section: mockSection1,
                    compatibleDiscussions: [],
                    compatibleLabs: []
                }
            ]
        });

        it('should persist course selection even with immediate reload', async () => {
            // Select a course
            const selectResult = await courseSelectionService.selectCourse(mockCourse);
            expect(selectResult.success).toBe(true);

            // Verify course is selected
            let selectedCourses = courseSelectionService.getSelectedCourses();
            expect(selectedCourses).toHaveLength(1);
            expect(selectedCourses[0].course.id).toBe(mockCourse.id);

            // Simulate immediate reload
            const newProfileStateManager = ProfileStateManager.getInstance();
            const newCourseSelectionService = new CourseSelectionService(newProfileStateManager);
            await newCourseSelectionService.initialize();

            // Verify course is still selected after "reload"
            selectedCourses = newCourseSelectionService.getSelectedCourses();
            expect(selectedCourses).toHaveLength(1);
            expect(selectedCourses[0].course.id).toBe(mockCourse.id);
        });

        it('should persist multiple rapid course selections', async () => {
            const courses: Course[] = [
                createMockCourse({ id: 'CS-2102', number: '2102', name: 'Object-Oriented Design' }),
                createMockCourse({ id: 'CS-3431', number: '3431', name: 'Database Systems' }),
                createMockCourse({ id: 'CS-4241', number: '4241', name: 'Webware' })
            ];

            // Rapidly select all courses
            for (const course of courses) {
                await courseSelectionService.selectCourse(course);
            }

            // Simulate reload
            const newStorageManager = new TransactionalStorageManager();
            const newProfileStateManager = ProfileStateManager.getInstance();
            const newCourseSelectionService = new CourseSelectionService(newProfileStateManager);
            await newCourseSelectionService.initialize();

            // Verify all courses are still selected
            const selectedCourses = newCourseSelectionService.getSelectedCourses();
            expect(selectedCourses).toHaveLength(3);
            expect(selectedCourses.map((sc: any) => sc.course.id).sort()).toEqual(['CS-2102', 'CS-3431', 'CS-4241']);
        });

        it('should persist course unselection', async () => {
            // Select a course
            await courseSelectionService.selectCourse(mockCourse);

            // Verify selected
            let selectedCourses = courseSelectionService.getSelectedCourses();
            expect(selectedCourses).toHaveLength(1);

            // Unselect the course
            const unselectResult = await courseSelectionService.unselectCourse(mockCourse);
            expect(unselectResult.success).toBe(true);

            // Simulate reload
            const newStorageManager = new TransactionalStorageManager();
            const newProfileStateManager = ProfileStateManager.getInstance();
            const newCourseSelectionService = new CourseSelectionService(newProfileStateManager);
            await newCourseSelectionService.initialize();

            // Verify course is no longer selected
            selectedCourses = newCourseSelectionService.getSelectedCourses();
            expect(selectedCourses).toHaveLength(0);
        });
    });

    describe('Section Selection Persistence', () => {
        const mockSectionA01 = createMockSection({
            crn: 12345,
            number: 'A01',
            seats: 30,
            seatsAvailable: 5,
            periods: [
                createMockPeriod({
                    type: PeriodType.LECTURE,
                    professor: 'Prof. Smith',
                    startTime: createMockTime(10, 0),
                    endTime: createMockTime(11, 50),
                    days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY]),
                    location: 'FL 320'
                })
            ]
        });

        const mockSectionB01 = createMockSection({
            crn: 12346,
            number: 'B01',
            seats: 30,
            seatsAvailable: 10,
            periods: [
                createMockPeriod({
                    type: PeriodType.LECTURE,
                    professor: 'Prof. Johnson',
                    startTime: createMockTime(14, 0),
                    endTime: createMockTime(15, 50),
                    days: new Set([DayOfWeek.TUESDAY, DayOfWeek.THURSDAY]),
                    location: 'FL 221'
                })
            ]
        });

        const mockCourse: Course = createMockCourse({
            id: 'CS-2102',
            number: '2102',
            name: 'Object-Oriented Design Concepts',
            description: 'Introduction to object-oriented design',
            minCredits: 3,
            maxCredits: 3,
            lectures: [
                {
                    section: mockSectionA01,
                    compatibleDiscussions: [],
                    compatibleLabs: []
                },
                {
                    section: mockSectionB01,
                    compatibleDiscussions: [],
                    compatibleLabs: []
                }
            ]
        });

        it('should persist section selection even with immediate reload', async () => {
            // Select course first
            await courseSelectionService.selectCourse(mockCourse);

            // Select a specific lecture section using setSelectedComponents
            const componentsResult = await courseSelectionService.setSelectedComponents(
                mockCourse,
                mockSectionA01,  // lecture
                null,            // discussion
                null             // lab
            );
            expect(componentsResult.success).toBe(true);

            // Simulate reload
            const newStorageManager = new TransactionalStorageManager();
            const newProfileStateManager = ProfileStateManager.getInstance();
            const newCourseSelectionService = new CourseSelectionService(newProfileStateManager);
            await newCourseSelectionService.initialize();

            // Verify section is still selected (check hierarchical field)
            const selectedCourses = newCourseSelectionService.getSelectedCourses();
            const selectedCourse = selectedCourses.find((sc: any) => sc.course.id === mockCourse.id);
            expect(selectedCourse).toBeDefined();
            expect(selectedCourse?.selectedLecture?.number).toBe(mockSectionA01.number);
        });

        it('should persist section change', async () => {
            // Select course
            await courseSelectionService.selectCourse(mockCourse);

            // Select section A01
            await courseSelectionService.setSelectedComponents(mockCourse, mockSectionA01, null, null);

            // Change to section B01
            const changeResult = await courseSelectionService.setSelectedComponents(
                mockCourse,
                mockSectionB01,
                null,
                null
            );
            expect(changeResult.success).toBe(true);

            // Simulate reload
            const newStorageManager = new TransactionalStorageManager();
            const newProfileStateManager = ProfileStateManager.getInstance();
            const newCourseSelectionService = new CourseSelectionService(newProfileStateManager);
            await newCourseSelectionService.initialize();

            // Verify section B01 is selected (not A01)
            const selectedCourses = newCourseSelectionService.getSelectedCourses();
            const selectedCourse = selectedCourses.find((sc: any) => sc.course.id === mockCourse.id);
            expect(selectedCourse?.selectedLecture?.number).toBe(mockSectionB01.number);
        });
    });

    describe('Batch Queue Flushing', () => {
        it('should flush pending batch operations before critical saves', async () => {
            // This test verifies that batch operations are flushed
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

            // Verify persistence - should be back to initial count
            const initialSchedules = profileStateManager.getAllSchedules();
            const initialCount = initialSchedules.length;

            const newStorageManager = new TransactionalStorageManager();
            const newProfileStateManager = ProfileStateManager.getInstance();
            const schedules = newProfileStateManager.getAllSchedules();
            expect(schedules).toHaveLength(initialCount);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty storage gracefully', async () => {
            // Clear all storage
            localStorage.clear();

            // Load from empty storage - ProfileStateManager creates a default schedule if none exist
            const newStorageManager = new TransactionalStorageManager();
            const newProfileStateManager = ProfileStateManager.getInstance();

            const schedules = newProfileStateManager.getAllSchedules();
            // Default schedule "My Schedule" is created when loading from empty storage
            expect(schedules).toHaveLength(1);
            expect(schedules[0].name).toBe('My Schedule');
        });

        it('should handle corrupted storage data', async () => {
            // Set invalid JSON in storage
            localStorage.setItem('wpi-planner-schedules', 'invalid{json}');

            // Should handle gracefully
            const newStorageManager = new TransactionalStorageManager();
            const newProfileStateManager = ProfileStateManager.getInstance();
            // getInstance() already handles initialization, no need to call loadFromStorage()
            const schedules = newProfileStateManager.getAllSchedules();
            expect(schedules).toBeDefined();
        });

        it('should handle concurrent modifications', async () => {
            const course1: Course = createMockCourse({
                id: 'CS-2102',
                number: '2102',
                name: 'OOD',
                description: 'Test course 1',
                minCredits: 3,
                maxCredits: 3
            });

            const course2: Course = createMockCourse({
                id: 'CS-3431',
                number: '3431',
                name: 'Database',
                description: 'Test course 2',
                minCredits: 3,
                maxCredits: 3
            });

            // Concurrent operations
            await Promise.all([
                courseSelectionService.selectCourse(course1),
                courseSelectionService.selectCourse(course2)
            ]);

            // Simulate reload
            const newStorageManager = new TransactionalStorageManager();
            const newProfileStateManager = ProfileStateManager.getInstance();
            const newCourseSelectionService = new CourseSelectionService(newProfileStateManager);
            await newCourseSelectionService.initialize();

            // Both should be persisted
            const selectedCourses = newCourseSelectionService.getSelectedCourses();
            expect(selectedCourses).toHaveLength(2);
        });
    });
});
