import { Schedule, SelectedCourse } from '../../types/schedule';
import { ProfileStateManager } from '../../core/state/ProfileStateManager';
import { DataValidator } from '../../core/validation/DataValidator';
import { CourseSelectionService } from './CourseSelectionService';
import {
  ICSGenerator,
  ICSExportOptions,
  ICSExportResult,
} from '../../utils/icsGenerator';
import { logger } from '../../utils/logger';
import { errorMessage } from '../../utils/errorMessage';

export interface ScheduleOperationResult {
  success: boolean;
  schedule?: Schedule;
  error?: string;
  warnings?: string[];
  message?: string;
}

export interface ScheduleCreationOptions {
  id?: string;
  includeCurrentCourses?: boolean;
  copyFromSchedule?: string;
  autoActivate?: boolean;
  autoSave?: boolean;
}

export interface ScheduleUpdateOptions {
  updateName?: string;
  updateCourses?: boolean;
  autoSave?: boolean;
}

/**
 * Manages the multi-schedule lifecycle: CRUD operations with validation.
 */
export class ScheduleManagementService {
  private profileStateManager: ProfileStateManager;
  private courseSelectionService: CourseSelectionService;
  private dataValidator: DataValidator;
  private isInitialized = false;
  private initializationPromise: Promise<boolean> | null = null;

  constructor(
    profileStateManager?: ProfileStateManager,
    courseSelectionService?: CourseSelectionService,
    dataValidator?: DataValidator,
  ) {
    this.profileStateManager =
      profileStateManager || ProfileStateManager.getInstance();
    this.courseSelectionService =
      courseSelectionService ||
      new CourseSelectionService(this.profileStateManager);
    this.dataValidator = dataValidator || new DataValidator();
  }

  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = this.performInitialization();
    return await this.initializationPromise;
  }

  private async performInitialization(): Promise<boolean> {
    try {
      await this.courseSelectionService.initialize();
      await this.profileStateManager.loadFromStorage();
      await this.initializeDefaultScheduleIfNeeded();

      this.isInitialized = true;
      return true;
    } catch (error) {
      logger.error('ScheduleManagementService initialization failed:', error);
      this.isInitialized = false;
      return false;
    } finally {
      this.initializationPromise = null;
    }
  }

  async createNewSchedule(
    name: string,
    options: ScheduleCreationOptions = {},
  ): Promise<ScheduleOperationResult> {
    await this.ensureInitialized();

    const {
      id,
      includeCurrentCourses = false,
      copyFromSchedule,
      autoActivate = true,
      autoSave = true,
    } = options;

    try {
      if (!name || name.trim().length === 0) {
        return {
          success: false,
          error: 'Schedule name cannot be empty',
        };
      }

      // Auto-generate a unique name instead of rejecting duplicates
      const existingSchedules = this.profileStateManager.getAllSchedules();
      const uniqueName = this.generateUniqueScheduleName(name);
      name = uniqueName;

      let selectedCourses: SelectedCourse[] = [];

      if (copyFromSchedule) {
        const sourceSchedule = existingSchedules.find(
          s => s.id === copyFromSchedule,
        );
        if (!sourceSchedule) {
          return {
            success: false,
            error: `Source schedule with ID "${copyFromSchedule}" not found`,
          };
        }
        selectedCourses = [...sourceSchedule.selectedCourses];
      } else if (includeCurrentCourses) {
        selectedCourses = this.profileStateManager.getSelectedCourses();
      }

      const schedule = this.profileStateManager.createSchedule(name, 'api', id);

      if (selectedCourses.length > 0) {
        const updateResult = await this.updateScheduleCourses(
          schedule.id,
          selectedCourses,
        );
        if (!updateResult.success) {
          return {
            success: false,
            error: `Schedule created but failed to add courses: ${updateResult.error}`,
          };
        }
      }

      if (autoActivate) {
        const activateResult = await this.setActiveSchedule(schedule.id);
        if (!activateResult.success) {
          logger.warn(
            'Schedule created but failed to activate:',
            activateResult.error,
          );
        }
      }

      if (autoSave) {
        this.profileStateManager.save();
      }

      return {
        success: true,
        schedule,
      };
    } catch (error) {
      logger.error('Error creating schedule:', error);
      return {
        success: false,
        error: `Error creating schedule: ${errorMessage(error)}`,
      };
    }
  }

  async setActiveSchedule(
    scheduleId: string,
  ): Promise<ScheduleOperationResult> {
    await this.ensureInitialized();

    try {
      const schedules = this.profileStateManager.getAllSchedules();
      const schedule = schedules.find(s => s.id === scheduleId);

      if (!schedule) {
        return {
          success: false,
          error: `Schedule with ID "${scheduleId}" not found`,
        };
      }

      const validation = this.dataValidator.validateSchedule(schedule);
      if (!validation.valid) {
        return {
          success: false,
          error: `Schedule validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
          warnings: validation.warnings.map(w => w.message),
        };
      }

      this.profileStateManager.setActiveSchedule(scheduleId, 'api');

      return {
        success: true,
        schedule,
      };
    } catch (error) {
      logger.error('Error setting active schedule:', error);
      return {
        success: false,
        error: `Error setting active schedule: ${errorMessage(error)}`,
      };
    }
  }

  async updateSchedule(
    scheduleId: string,
    updates: Partial<Schedule>,
    options: ScheduleUpdateOptions = {},
  ): Promise<ScheduleOperationResult> {
    await this.ensureInitialized();
    const { autoSave = true } = options;

    try {
      const schedules = this.profileStateManager.getAllSchedules();
      const existingSchedule = schedules.find(s => s.id === scheduleId);

      if (!existingSchedule) {
        return {
          success: false,
          error: `Schedule with ID "${scheduleId}" not found`,
        };
      }

      const updatedSchedule = { ...existingSchedule, ...updates };
      const validation = this.dataValidator.validateSchedule(updatedSchedule);
      if (!validation.valid) {
        return {
          success: false,
          error: `Schedule update validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
          warnings: validation.warnings.map(w => w.message),
        };
      }

      this.profileStateManager.updateSchedule(scheduleId, updates, 'api');

      if (autoSave) {
        this.profileStateManager.save();
      }

      const finalSchedule = this.profileStateManager
        .getAllSchedules()
        .find(s => s.id === scheduleId);

      return {
        success: true,
        schedule: finalSchedule,
      };
    } catch (error) {
      logger.error('Error updating schedule:', error);
      return {
        success: false,
        error: `Error updating schedule: ${errorMessage(error)}`,
      };
    }
  }

  async renameSchedule(
    scheduleId: string,
    newName: string,
  ): Promise<ScheduleOperationResult> {
    if (!newName || newName.trim().length === 0) {
      return {
        success: false,
        error: 'Schedule name cannot be empty',
      };
    }

    const existingSchedules = this.profileStateManager.getAllSchedules();
    if (
      existingSchedules.some(s => s.name === newName && s.id !== scheduleId)
    ) {
      return {
        success: false,
        error: `A schedule with the name "${newName}" already exists`,
      };
    }

    return this.updateSchedule(scheduleId, { name: newName });
  }

  async duplicateSchedule(
    scheduleId: string,
    newName: string,
  ): Promise<ScheduleOperationResult> {
    await this.ensureInitialized();

    try {
      if (!newName || newName.trim().length === 0) {
        return {
          success: false,
          error: 'Schedule name cannot be empty',
        };
      }

      const duplicatedSchedule = this.profileStateManager.duplicateSchedule(
        scheduleId,
        newName,
        'api',
      );

      if (!duplicatedSchedule) {
        return {
          success: false,
          error: `Schedule with ID "${scheduleId}" not found`,
        };
      }

      this.profileStateManager.save();

      return {
        success: true,
        schedule: duplicatedSchedule,
      };
    } catch (error) {
      logger.error('Error duplicating schedule:', error);
      return {
        success: false,
        error: `Error duplicating schedule: ${errorMessage(error)}`,
      };
    }
  }

  async deleteSchedule(
    scheduleId: string,
    options: { force?: boolean } = {},
  ): Promise<{ success: boolean; error?: string }> {
    await this.ensureInitialized();
    const { force = false } = options;

    try {
      const schedules = this.profileStateManager.getAllSchedules();
      const scheduleToDelete = schedules.find(s => s.id === scheduleId);

      if (!scheduleToDelete) {
        return {
          success: false,
          error: `Schedule with ID "${scheduleId}" not found`,
        };
      }

      // Prevent deletion of last schedule unless forced
      if (schedules.length <= 1 && !force) {
        return {
          success: false,
          error:
            'Cannot delete the last schedule. At least one schedule must exist.',
        };
      }

      this.profileStateManager.deleteSchedule(scheduleId, 'api');

      this.profileStateManager.save();

      return { success: true };
    } catch (error) {
      logger.error('Error deleting schedule:', error);
      return {
        success: false,
        error: `Error deleting schedule: ${errorMessage(error)}`,
      };
    }
  }

  getActiveSchedule(): Schedule | null {
    if (!this.isInitialized) return null;
    return this.profileStateManager.getActiveSchedule();
  }

  getActiveScheduleId(): string | null {
    const activeSchedule = this.getActiveSchedule();
    return activeSchedule?.id || null;
  }

  getAllSchedules(): Schedule[] {
    if (!this.isInitialized) return [];
    return this.profileStateManager.getAllSchedules();
  }

  getScheduleById(scheduleId: string): Schedule | null {
    const schedules = this.getAllSchedules();
    return schedules.find(s => s.id === scheduleId) || null;
  }

  // Legacy compatibility methods
  loadSchedule(scheduleId: string): Schedule | null {
    return this.getScheduleById(scheduleId);
  }

  private async updateScheduleCourses(
    scheduleId: string,
    selectedCourses: SelectedCourse[],
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const validation = this.dataValidator.validateBatch(
        selectedCourses,
        course => this.dataValidator.validateSelectedCourse(course),
      );

      if (!validation.valid) {
        return {
          success: false,
          error: `Course validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
        };
      }

      const updateResult = await this.updateSchedule(scheduleId, {
        selectedCourses: [...selectedCourses],
      });

      return {
        success: updateResult.success,
        error: updateResult.error,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update schedule courses: ${errorMessage(error)}`,
      };
    }
  }

  async save(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.ensureInitialized();
      this.profileStateManager.save();
      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: `Save failed: ${errorMessage(error)}`,
      };
    }
  }

  hasUnsavedChanges(): boolean {
    if (!this.isInitialized) return false;
    return this.profileStateManager.hasUnsavedChanges();
  }

  async exportSchedule(
    scheduleId: string,
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      const data = await this.profileStateManager.exportData();
      if (!data) {
        return {
          success: false,
          error: 'Export failed',
        };
      }

      const parsed = JSON.parse(data);
      const scheduleIndex = this.profileStateManager
        .getAllSchedules()
        .findIndex(s => s.id === scheduleId);

      if (scheduleIndex === -1) {
        return {
          success: false,
          error: `Schedule with ID "${scheduleId}" not found`,
        };
      }

      const singleScheduleExport = {
        v: parsed.v,
        a: 0,
        s: [parsed.s[scheduleIndex]],
        p: parsed.p,
      };

      return {
        success: true,
        data: JSON.stringify(singleScheduleExport),
      };
    } catch (error) {
      return {
        success: false,
        error: `Export failed: ${errorMessage(error)}`,
      };
    }
  }

  async exportAllSchedules(): Promise<{
    success: boolean;
    data?: string;
    error?: string;
  }> {
    try {
      const data = await this.profileStateManager.exportData();
      if (!data) {
        return {
          success: false,
          error: 'Export failed',
        };
      }
      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: `Export all failed: ${errorMessage(error)}`,
      };
    }
  }

  async exportScheduleICS(
    scheduleId: string,
    options: ICSExportOptions = {},
  ): Promise<ICSExportResult & { error?: string }> {
    try {
      const schedule = this.getScheduleById(scheduleId);
      if (!schedule) {
        return {
          success: false,
          skippedCourses: 0,
          totalCourses: 0,
          error: `Schedule with ID "${scheduleId}" not found`,
        };
      }

      const result = ICSGenerator.generateICS(schedule, options);

      if (!result.success) {
        return result;
      }

      return result;
    } catch (error) {
      return {
        success: false,
        skippedCourses: 0,
        totalCourses: 0,
        error: `ICS export failed: ${errorMessage(error)}`,
      };
    }
  }

  async importScheduleInto(
    scheduleId: string,
    jsonData: string,
  ): Promise<ScheduleOperationResult> {
    try {
      await this.ensureInitialized();

      const data = JSON.parse(jsonData);
      if (!data.v?.startsWith('4')) {
        return {
          success: false,
          error:
            'Unsupported import format. Please export your schedules again using the latest version.',
        };
      }

      const importedCourses =
        this.profileStateManager.parseImportCourses(jsonData);
      const existing = this.profileStateManager
        .getAllSchedules()
        .find(s => s.id === scheduleId);
      if (!existing) {
        return { success: false, error: 'Schedule not found' };
      }

      const existingIds = new Set(
        existing.selectedCourses.map(c => c.course.id),
      );
      const merged = [
        ...existing.selectedCourses,
        ...importedCourses.filter(c => !existingIds.has(c.course.id)),
      ];

      const result = await this.updateSchedule(scheduleId, {
        selectedCourses: merged,
      });

      if (result.success && scheduleId === this.getActiveScheduleId()) {
        this.profileStateManager.setActiveSchedule(scheduleId, 'api');
      }

      return result;
    } catch (error) {
      return { success: false, error: `Import failed: ${errorMessage(error)}` };
    }
  }

  getCourseSelectionService(): CourseSelectionService {
    return this.courseSelectionService;
  }

  async performHealthCheck(): Promise<{ healthy: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      if (!this.isInitialized) {
        issues.push('Service not initialized');
      }

      const schedules = this.getAllSchedules();
      const validation = this.dataValidator.validateBatch(schedules, schedule =>
        this.dataValidator.validateSchedule(schedule),
      );

      if (!validation.valid) {
        issues.push(
          `Schedule validation: ${validation.errors.length} errors found`,
        );
      }

      // Check active schedule consistency
      const activeScheduleId = this.getActiveScheduleId();
      if (activeScheduleId && !schedules.some(s => s.id === activeScheduleId)) {
        issues.push('Active schedule ID references non-existent schedule');
      }
    } catch (error) {
      issues.push(`Health check error: ${errorMessage(error)}`);
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  async initializeDefaultScheduleIfNeeded(): Promise<void> {
    const existingSchedules = this.profileStateManager.getAllSchedules();

    if (existingSchedules.length === 0) {
      // Use ProfileStateManager directly to avoid circular dependency
      const defaultSchedule = this.profileStateManager.createSchedule(
        'My Schedule',
        'system',
      );
      this.profileStateManager.setActiveSchedule(defaultSchedule.id, 'system');
      this.profileStateManager.save();
    } else if (!this.getActiveScheduleId()) {
      // No active schedule recorded: fall back to the most recent one
      this.profileStateManager.setActiveSchedule(
        existingSchedules[existingSchedules.length - 1].id,
        'system',
      );
    }
  }

  private generateUniqueScheduleName(baseName: string): string {
    const existingSchedules = this.getAllSchedules();
    const existingNames = new Set(existingSchedules.map(s => s.name));

    if (!existingNames.has(baseName)) {
      return baseName;
    }

    // Append an incrementing suffix until the name is unique
    let counter = 1;
    let candidateName: string;

    do {
      candidateName = `${baseName} (${counter})`;
      counter++;
    } while (existingNames.has(candidateName));

    return candidateName;
  }

  async getStorageStats() {
    return this.profileStateManager.getStorageStats();
  }

  async clearAllSchedules(): Promise<void> {
    await this.profileStateManager.clearAllData();
  }
}
