/**
 * Storage Migration Utility
 *
 * Handles one-time migration from localStorage to IndexedDB for schedule data.
 * This migration ensures:
 * - Existing schedules are preserved
 * - No data loss during transition
 * - Backward compatibility maintained
 * - Clean migration with verification
 */

import { Schedule } from '../types/schedule';
import { IndexedDBStorageManager } from '../core/IndexedDBStorageManager';

interface MigrationResult {
    success: boolean;
    migratedCount: number;
    errors: string[];
    skipped: boolean;
}

export class StorageMigration {
    private static readonly MIGRATION_FLAG_KEY = 'wpi-planner-indexeddb-migrated';
    private static readonly SCHEDULES_KEY = 'wpi-planner-schedules';
    private static readonly BACKUP_KEY = 'wpi-planner-schedules-backup';

    static async checkMigrationStatus(): Promise<boolean> {
        const migrated = localStorage.getItem(StorageMigration.MIGRATION_FLAG_KEY);
        return migrated === 'true';
    }

    static async performMigration(indexedDBStorage: IndexedDBStorageManager): Promise<MigrationResult> {
        const result: MigrationResult = {
            success: false,
            migratedCount: 0,
            errors: [],
            skipped: false
        };

        try {
            const alreadyMigrated = await StorageMigration.checkMigrationStatus();
            if (alreadyMigrated) {
                console.log('Migration already completed, skipping...');
                result.skipped = true;
                result.success = true;
                return result;
            }

            const schedulesData = localStorage.getItem(StorageMigration.SCHEDULES_KEY);
            if (!schedulesData) {
                console.log('No schedules to migrate, marking as complete');
                localStorage.setItem(StorageMigration.MIGRATION_FLAG_KEY, 'true');
                result.success = true;
                result.skipped = true;
                return result;
            }

            let schedules: Schedule[];
            try {
                schedules = JSON.parse(schedulesData);
                if (!Array.isArray(schedules)) {
                    throw new Error('Invalid schedules data format');
                }
            } catch (error) {
                result.errors.push(`Failed to parse schedules: ${(error as Error).message}`);
                return result;
            }

            console.log(`Starting migration of ${schedules.length} schedules to IndexedDB...`);

            localStorage.setItem(StorageMigration.BACKUP_KEY, schedulesData);
            console.log('Backup created in localStorage');

            for (const schedule of schedules) {
                try {
                    const saveResult = await indexedDBStorage.saveSchedule(schedule);
                    if (saveResult.success) {
                        result.migratedCount++;
                        console.log(`Migrated schedule: ${schedule.name} (${schedule.id})`);
                    } else {
                        result.errors.push(`Failed to migrate schedule ${schedule.id}: ${saveResult.error}`);
                    }
                } catch (error) {
                    result.errors.push(`Exception migrating schedule ${schedule.id}: ${(error as Error).message}`);
                }
            }

            if (result.migratedCount === schedules.length) {
                const verifyResult = await indexedDBStorage.loadAllSchedules();
                if (verifyResult.success && verifyResult.data?.length === schedules.length) {
                    localStorage.removeItem(StorageMigration.SCHEDULES_KEY);
                    localStorage.setItem(StorageMigration.MIGRATION_FLAG_KEY, 'true');
                    result.success = true;
                    console.log(`Migration completed successfully! ${result.migratedCount} schedules migrated.`);
                    console.log('localStorage schedules cleared (backup retained)');
                } else {
                    result.errors.push('Verification failed: schedule count mismatch');
                    result.success = false;
                }
            } else {
                result.errors.push(`Only ${result.migratedCount}/${schedules.length} schedules migrated`);
                result.success = false;
            }

        } catch (error) {
            result.errors.push(`Migration exception: ${(error as Error).message}`);
            result.success = false;
        }

        return result;
    }

    static async rollbackMigration(): Promise<boolean> {
        try {
            const backup = localStorage.getItem(StorageMigration.BACKUP_KEY);
            if (backup) {
                localStorage.setItem(StorageMigration.SCHEDULES_KEY, backup);
                localStorage.removeItem(StorageMigration.MIGRATION_FLAG_KEY);
                console.log('Migration rolled back successfully');
                return true;
            } else {
                console.warn('No backup found for rollback');
                return false;
            }
        } catch (error) {
            console.error('Failed to rollback migration:', error);
            return false;
        }
    }

    static clearBackup(): void {
        localStorage.removeItem(StorageMigration.BACKUP_KEY);
        console.log('Migration backup cleared');
    }

    static async exportSchedulesToFile(): Promise<void> {
        try {
            const schedulesData = localStorage.getItem(StorageMigration.SCHEDULES_KEY);
            if (!schedulesData) {
                console.warn('No schedules to export');
                return;
            }

            const blob = new Blob([schedulesData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `wpi-schedules-backup-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('Schedules exported to file');
        } catch (error) {
            console.error('Failed to export schedules:', error);
        }
    }
}
