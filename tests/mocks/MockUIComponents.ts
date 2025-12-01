import { vi } from 'vitest';
import type { Department } from '../../src/types/Course';

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
    public refreshCourseSelectionUI = vi.fn();
    public displaySelectedCourses = vi.fn();
    public setAllDepartments = vi.fn();
    public setCourseData = vi.fn();

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
    public displayScheduleSelectedCourses = vi.fn();
    public renderScheduleGrids = vi.fn();
    public setAllDepartments = vi.fn();

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

    public redistributeToConsumers = vi.fn((departments: Department[]) => {
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
 * Mock CloudStatusButton
 */
export class MockCloudStatusButton {
    public onStateChange = vi.fn();
    public updateStatus = vi.fn();

    reset() {
        this.onStateChange.mockClear();
        this.updateStatus.mockClear();
    }
}

/**
 * Mock SchedulePickerModal
 */
export class MockSchedulePickerModal {
    public onActiveScheduleChange = vi.fn();
    public refreshScheduleList = vi.fn();

    reset() {
        this.onActiveScheduleChange.mockClear();
        this.refreshScheduleList.mockClear();
    }
}

/**
 * Mock DepartmentController
 */
export class MockDepartmentController {
    public setAllDepartments = vi.fn();
    public renderDepartments = vi.fn();

    reset() {
        this.setAllDepartments.mockClear();
        this.renderDepartments.mockClear();
    }
}

/**
 * Mock SearchService
 */
export class MockSearchService {
    public setCourseData = vi.fn();
    public reindex = vi.fn();

    reset() {
        this.setCourseData.mockClear();
        this.reindex.mockClear();
    }
}

/**
 * Mock FilterModalController
 */
export class MockFilterModalController {
    public setCourseData = vi.fn();
    public resetFilters = vi.fn();

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
    cloudStatusButton: MockCloudStatusButton;
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
        cloudStatusButton: new MockCloudStatusButton(),
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
    ctx.cloudStatusButton.reset();
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
