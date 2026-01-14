// =============================================================================
// Cloud Sync Types - Simplified Architecture
// =============================================================================

import type { ConnectedCalendar } from '../calendar/types';

// -----------------------------------------------------------------------------
// Sync Status & Events
// -----------------------------------------------------------------------------

export type SyncStatus =
    | 'idle'
    | 'syncing'
    | 'conflict'
    | 'error'
    | 'not_authenticated';

/**
 * Optimized event types (10 core events).
 * Removed unused events: sync-completed, sync-uploaded (duplicate),
 * sync-conflict-resolved (use sync-resolved), sync-cancelled,
 * cloud-data-applied, provider-changed
 */
export type SyncEventType =
    | 'auth-changed'           // Authentication status changed
    | 'sync-conflict'          // Conflict detected during sign-in
    | 'sync-resolved'          // User resolved a conflict
    | 'sync-pushed'            // Data pushed to cloud successfully
    | 'sync-failed'            // Sync operation failed
    | 'sync-started'           // Sync operation started
    | 'local-save-completed'   // Local save completed (triggers cloud sync)
    | 'offline-mode'           // Browser went offline
    | 'online-mode'            // Browser came back online
    | 'silent-auth-completed'; // Silent authentication completed on app startup

export interface SyncEvent {
    type: SyncEventType;
    timestamp: number;
    data?: unknown;
    error?: Error;
}

export type SyncEventListener = (event: SyncEvent) => void;

// -----------------------------------------------------------------------------
// Sync Data
// -----------------------------------------------------------------------------

export interface SyncData {
    version: string;
    timestamp: number;
    checksum: string;
    activeScheduleId: string | null;
    schedules: ScheduleData[];
    preferences?: unknown;
}

export interface ScheduleData {
    id: string;
    name: string;
    selectedCourses: SelectedCourseData[];
    timestamp?: number;
    connectedCalendar?: ConnectedCalendar;
}

export interface SelectedCourseData {
    courseId: string;               // Course ID only (not full object)
    selectedSectionCrn?: string;   // Just the CRN, not full section
    lockedSectionCrn?: string;      // Locked section CRN if any
    isRequired: boolean;
    timestamp?: number;             // When selection was made (for merge conflicts)
}

export interface CourseData {
    id: string;
    subject: string;
    courseNumber: string;
    title: string;
    sections: SectionData[];
}

export interface SectionData {
    crn: string;
    section: string;
    instructor: string;
    meetings: MeetingData[];
}

export interface MeetingData {
    days: string;
    startTime: string;
    endTime: string;
    location: string;
}

// -----------------------------------------------------------------------------
// Conflict Resolution
// -----------------------------------------------------------------------------

export interface ConflictInfo {
    hasConflict: boolean;
    localData: SyncData;
    cloudData: SyncData;
}

export type ConflictResolution = 'local' | 'cloud' | 'cancel';

// -----------------------------------------------------------------------------
// Provider Interface
// -----------------------------------------------------------------------------

export interface CloudProvider {
    readonly id: string;
    readonly displayName: string;
    readonly icon?: string;

    // Lifecycle
    initialize(): Promise<void>;
    dispose(): void;

    // Authentication
    signIn(): Promise<void>;
    signOut(): Promise<void>;
    isAuthenticated(): boolean;

    // Data operations
    pushData(data: SyncData): Promise<void>;
    pullData(): Promise<SyncData | null>;
}

export interface ProviderInfo {
    id: string;
    displayName: string;
    icon?: string;
    isAuthenticated: boolean;
}

// -----------------------------------------------------------------------------
// Legacy compatibility - CloudStateData mapping
// -----------------------------------------------------------------------------

/**
 * Maps the old CloudStateData format to the new SyncData format.
 * Used during migration and for ProfileStateManager compatibility.
 */
export interface LegacyCloudStateData {
    version: string;
    timestamp: string;
    checksum: string;
    state: {
        selectedSections?: string[];
        [key: string]: unknown;
    };
    schedules: unknown[];
    preferences: unknown;
    syncMetadata?: {
        deviceId: string;
        lastSyncTimestamp: number;
        syncVersion: string;
        deviceName?: string;
    };
}

/**
 * Convert legacy CloudStateData to new SyncData format
 */
export function fromLegacyData(legacy: LegacyCloudStateData): SyncData {
    return {
        version: legacy.version,
        timestamp: new Date(legacy.timestamp).getTime(),
        checksum: legacy.checksum,
        activeScheduleId: null,
        schedules: legacy.schedules as ScheduleData[] || [],
        preferences: legacy.preferences,
    };
}

/**
 * Convert new SyncData format to legacy CloudStateData
 */
export function toLegacyData(data: SyncData, deviceId: string): LegacyCloudStateData {
    return {
        version: data.version,
        timestamp: new Date(data.timestamp).toISOString(),
        checksum: data.checksum,
        state: {
            selectedSections: [],
        },
        schedules: data.schedules,
        preferences: data.preferences || {},
        syncMetadata: {
            deviceId,
            lastSyncTimestamp: data.timestamp,
            syncVersion: '2.0',
        },
    };
}
