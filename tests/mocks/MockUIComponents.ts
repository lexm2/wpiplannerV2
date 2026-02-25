import { mock, expect } from 'bun:test';
import type { Department } from '../../src/types/types';

/**
 * Mock UI Components for testing UI hydration after sync
 *
 * These mocks allow us to verify that UI components receive updates
 * after cloud sync data is imported.
 */

/**
 * Mock CourseController
 */
export class MockCourseController {
    public refreshCourseSelectionUI = mock();
    public displaySelectedCourses = mock();
    public setAllDepartments = mock();
    public setCourseData = mock();

    reset() {
        this.refreshCourseSelectionUI.mockClear();
        this.displaySelectedCourses.mockClear();
        this.setAllDepartments.mockClear();
        this.setCourseData.mockClear();
    }
}

/**
 * Mock ScheduleController
 */
export class MockScheduleController {
    public displayScheduleSelectedCourses = mock();
    public renderScheduleGrids = mock();
    public setAllDepartments = mock();

    reset() {
        this.displayScheduleSelectedCourses.mockClear();
        this.renderScheduleGrids.mockClear();
        this.setAllDepartments.mockClear();
    }
}

/**
 * Mock CourseDataCoordinator
 */
export class MockCourseDataCoordinator {
    private consumers: Array<{ setAllDepartments: (deps: Department[]) => void }> = [];

    public registerConsumer(consumer: { setAllDepartments: (deps: Department[]) => void }) {
        this.consumers.push(consumer);
    }

    public redistributeToConsumers = mock((departments: Department[]) => {
        this.consumers.forEach((consumer) => {
            consumer.setAllDepartments(departments);
        });
    });

    public getConsumerCount(): number {
        return this.consumers.length;
    }

    reset() {
        this.redistributeToConsumers.mockClear();
        this.consumers = [];
    }
}

/**
 * Mock SchedulePickerModal
 */
export class MockSchedulePickerModal {
    public onActiveScheduleChange = mock();
    public refreshScheduleList = mock();

    reset() {
        this.onActiveScheduleChange.mockClear();
        this.refreshScheduleList.mockClear();
    }
}

/**
 * Mock DepartmentController
 */
export class MockDepartmentController {
    public setAllDepartments = mock();
    public renderDepartments = mock();

    reset() {
        this.setAllDepartments.mockClear();
        this.renderDepartments.mockClear();
    }
}

/**
 * Mock SearchService
 */
export class MockSearchService {
    public setCourseData = mock();
    public reindex = mock();

    reset() {
        this.setCourseData.mockClear();
        this.reindex.mockClear();
    }
}

/**
 * Mock FilterModalController
 */
export class MockFilterModalController {
    public setCourseData = mock();
    public resetFilters = mock();

    reset() {
        this.setCourseData.mockClear();
        this.resetFilters.mockClear();
    }
}

/**
 * Collection of all mocked UI components
 */
export interface MockUIContext {
    courseController: MockCourseController;
    scheduleController: MockScheduleController;
    courseDataCoordinator: MockCourseDataCoordinator;
    schedulePickerModal: MockSchedulePickerModal;
    departmentController: MockDepartmentController;
    searchService: MockSearchService;
    filterModalController: MockFilterModalController;
}

/**
 * Create all mock UI components
 */
export function createMockUIComponents(): MockUIContext {
    return {
        courseController: new MockCourseController(),
        scheduleController: new MockScheduleController(),
        courseDataCoordinator: new MockCourseDataCoordinator(),
        schedulePickerModal: new MockSchedulePickerModal(),
        departmentController: new MockDepartmentController(),
        searchService: new MockSearchService(),
        filterModalController: new MockFilterModalController(),
    };
}

/**
 * Reset all mock UI components
 */
export function resetMockUIComponents(ctx: MockUIContext): void {
    ctx.courseController.reset();
    ctx.scheduleController.reset();
    ctx.courseDataCoordinator.reset();
    ctx.schedulePickerModal.reset();
    ctx.departmentController.reset();
    ctx.searchService.reset();
    ctx.filterModalController.reset();
}

/**
 * Verify UI hydration occurred
 *
 * Checks that all expected UI components were called after data import
 */
export function assertUIHydrated(ctx: MockUIContext): void {
    expect(ctx.courseDataCoordinator.redistributeToConsumers).toHaveBeenCalled();

    // At least some consumers should have received data
    const consumerCount = ctx.courseDataCoordinator.getConsumerCount();
    expect(consumerCount).toBeGreaterThan(0);
}

/**
 * Verify schedule UI updated
 */
export function assertScheduleUIUpdated(ctx: MockUIContext): void {
    expect(ctx.scheduleController.displayScheduleSelectedCourses).toHaveBeenCalled();
}

/**
 * Verify course selection UI updated
 */
export function assertCourseSelectionUIUpdated(ctx: MockUIContext): void {
    expect(ctx.courseController.refreshCourseSelectionUI).toHaveBeenCalled();
    expect(ctx.courseController.displaySelectedCourses).toHaveBeenCalled();
}
