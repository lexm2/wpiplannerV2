/**
 * Stub types for backward compatibility with local export/import.
 * Cloud sync has been removed, but these types are needed for ApplicationState.
 */

import type { SchedulePreferences } from './schedule';

/**
 * Legacy sync data format (IDs only)
 * Used for local export - not actually synced to cloud
 */
export interface ScheduleData {
    id: string;
    name: string;
    timestamp: number;
    selectedCourses: SelectedCourseData[];
    connectedCalendar?: any;
}

export interface SelectedCourseData {
    courseId: string;
    selectedSectionCrn?: string;
    lockedSectionCrn?: string;
    isRequired: boolean;
    timestamp: number;
}

export interface SyncData {
    version: string;
    timestamp: number;
    checksum: string;
    activeScheduleId: string | null;
    schedules: ScheduleData[];
    lastModified: string;
    preferences?: SchedulePreferences;
}

/**
 * Stub checksum calculator for local use only
 */
export const checksumCalculator = {
    async calculateChecksum(_data: any): Promise<string> {
        // Return a dummy checksum since cloud sync is removed
        return 'local-only-' + Date.now().toString(36);
    }
};
