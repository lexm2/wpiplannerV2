import { Schedule, UserScheduleState, SchedulePreferences, SelectedCourse } from '../types/schedule'
import { Course, Section, Department } from '../types/types'
import { DataValidator, ValidationResult } from './DataValidator'
import { TransactionalStorageManager, TransactionResult } from './TransactionalStorageManager'
import { RetryManager } from './RetryManager'

export interface MigrationResult {
    success: boolean;
    fromVersion: string;
    toVersion: string;
    migratedData?: any;
    backupCreated: boolean;
    errors: string[];
    warnings: string[];
    itemsChanged: number;
}

export interface MigrationStep {
    fromVersion: string;
    toVersion: string;
    description: string;
    migrate: (data: any) => Promise<any> | any;
    validate?: (data: any) => ValidationResult;
    rollback?: (originalData: any, migratedData: any) => any;
}

export interface BackupInfo {
    version: string;
    timestamp: string;
    dataChecksum: string;
    migrationId: string;
}

export class ProfileMigrationService {
    private static readonly CURRENT_VERSION = '2.0';
    private static readonly BACKUP_KEY_PREFIX = 'wpi-planner-backup';
    private static readonly MIGRATION_LOG_KEY = 'wpi-planner-migration-log';
    
    private migrationSteps: MigrationStep[] = [];
    private dataValidator: DataValidator;
    private storageManager: TransactionalStorageManager;
    private retryManager: RetryManager;

    constructor(
        dataValidator?: DataValidator,
        storageManager?: TransactionalStorageManager,
        retryManager?: RetryManager
    ) {
        this.dataValidator = dataValidator || new DataValidator();
        this.storageManager = storageManager || new TransactionalStorageManager();
        this.retryManager = retryManager || RetryManager.createStorageRetryManager();
        
        this.initializeMigrationSteps();
    }

    async migrateToLatest(data: any): Promise<MigrationResult> {
        const currentVersion = this.detectDataVersion(data);
        
        if (currentVersion === ProfileMigrationService.CURRENT_VERSION) {
            return {
                success: true,
                fromVersion: currentVersion,
                toVersion: ProfileMigrationService.CURRENT_VERSION,
                backupCreated: false,
                errors: [],
                warnings: ['Data is already at the latest version'],
                itemsChanged: 0
            };
        }

        return this.migrateFromTo(data, currentVersion, ProfileMigrationService.CURRENT_VERSION);
    }

    async migrateFromTo(data: any, fromVersion: string, toVersion: string): Promise<MigrationResult> {
        const migrationId = this.generateMigrationId();
        const result: MigrationResult = {
            success: false,
            fromVersion,
            toVersion,
            backupCreated: false,
            errors: [],
            warnings: [],
            itemsChanged: 0
        };

        try {
            // Create backup before migration
            const backupResult = await this.createBackup(data, fromVersion, migrationId);
            result.backupCreated = backupResult;

            if (!backupResult) {
                result.errors.push('Failed to create backup before migration');
                return result;
            }

            // Find migration path
            const migrationPath = this.findMigrationPath(fromVersion, toVersion);
            if (migrationPath.length === 0) {
                result.errors.push(`No migration path found from ${fromVersion} to ${toVersion}`);
                return result;
            }

            // Execute migration steps
            let currentData = this.deepClone(data);
            let totalItemsChanged = 0;

            for (const step of migrationPath) {
                console.log(`🔄 Executing migration step: ${step.fromVersion} → ${step.toVersion}`);
                console.log(`   ${step.description}`);

                try {
                    // Execute migration step with retry
                    const migrationResult = await this.retryManager.executeWithRetry(
                        () => step.migrate(currentData),
                        {
                            operationName: `migration ${step.fromVersion} → ${step.toVersion}`,
                            onRetry: (attempt, error) => {
                                console.warn(`Migration step failed, retrying (attempt ${attempt}):`, error.message);
                            }
                        }
                    );

                    if (!migrationResult.success) {
                        throw migrationResult.error || new Error('Migration step failed');
                    }

                    currentData = migrationResult.result;

                    // Validate migrated data if validator provided
                    if (step.validate) {
                        const validation = step.validate(currentData);
                        if (!validation.valid) {
                            throw new Error(`Migration validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
                        }
                        result.warnings.push(...validation.warnings.map(w => w.message));
                    }

                    totalItemsChanged++;

                } catch (error) {
                    console.error(`Migration step ${step.fromVersion} → ${step.toVersion} failed:`, error);
                    
                    // Attempt rollback if available
                    if (step.rollback) {
                        try {
                            console.log(`🔄 Attempting rollback for step ${step.fromVersion} → ${step.toVersion}`);
                            currentData = step.rollback(data, currentData);
                        } catch (rollbackError) {
                            console.error('Rollback failed:', rollbackError);
                            result.errors.push(`Migration failed and rollback failed: ${rollbackError}`);
                        }
                    }

                    result.errors.push(`Migration step failed: ${error}`);
                    
                    // Restore from backup
                    await this.restoreFromBackup(migrationId);
                    return result;
                }
            }

            // Final validation of migrated data
            const finalValidation = this.validateMigratedData(currentData, toVersion);
            if (!finalValidation.valid) {
                result.errors.push(`Final validation failed: ${finalValidation.errors.map(e => e.message).join(', ')}`);
                await this.restoreFromBackup(migrationId);
                return result;
            }

            result.warnings.push(...finalValidation.warnings.map(w => w.message));

            // Log successful migration
            await this.logMigration({
                migrationId,
                fromVersion,
                toVersion,
                timestamp: new Date().toISOString(),
                success: true,
                itemsChanged: totalItemsChanged
            });

            result.success = true;
            result.migratedData = currentData;
            result.itemsChanged = totalItemsChanged;

            console.log(`✅ Migration completed successfully from ${fromVersion} to ${toVersion}`);
            return result;

        } catch (error) {
            console.error('Migration process failed:', error);
            result.errors.push(`Migration process failed: ${error}`);
            
            if (result.backupCreated) {
                await this.restoreFromBackup(migrationId);
            }
            
            return result;
        }
    }

    private initializeMigrationSteps(): void {
        // Migration from 1.0 to 2.0: Add selectedSectionNumber field and improve structure
        this.migrationSteps.push({
            fromVersion: '1.0',
            toVersion: '2.0',
            description: 'Add selectedSectionNumber field and improve data structure consistency',
            migrate: (data: any) => {
                return this.migrate1_0To2_0(data);
            },
            validate: (data: any) => {
                return this.dataValidator.validateUserScheduleState(data);
            },
            rollback: (originalData: any) => {
                // Simple rollback - just return original data
                return originalData;
            }
        });

        // Future migration example: 2.0 to 2.1
        this.migrationSteps.push({
            fromVersion: '2.0',
            toVersion: '2.1',
            description: 'Add new preference fields and optimize storage format',
            migrate: (data: any) => {
                return this.migrate2_0To2_1(data);
            },
            validate: (data: any) => {
                return this.dataValidator.validateUserScheduleState(data);
            }
        });
    }

    private migrate1_0To2_0(data: any): any {
        console.log('🔄 Migrating from 1.0 to 2.0...');
        let itemsChanged = 0;

        const migratedData = this.deepClone(data);

        // Add version field
        migratedData.version = '2.0';

        // Migrate selected courses to have both selectedSection and selectedSectionNumber
        if (migratedData.selectedCourses && Array.isArray(migratedData.selectedCourses)) {
            migratedData.selectedCourses.forEach((selectedCourse: any) => {
                // Ensure isRequired field exists
                if (selectedCourse.isRequired === undefined) {
                    selectedCourse.isRequired = false;
                    itemsChanged++;
                }

                // Handle selectedSection migration
                if (selectedCourse.selectedSection) {
                    if (typeof selectedCourse.selectedSection === 'string') {
                        // Old format: selectedSection was just a string
                        selectedCourse.selectedSectionNumber = selectedCourse.selectedSection;
                        selectedCourse.selectedSection = null; // Will be reconstructed later
                        itemsChanged++;
                    } else if (selectedCourse.selectedSection.number) {
                        // New format: selectedSection is an object
                        selectedCourse.selectedSectionNumber = selectedCourse.selectedSection.number;
                        // Keep the section object but it will be reconstructed from fresh data
                        itemsChanged++;
                    }
                } else {
                    // Ensure both fields exist
                    selectedCourse.selectedSection = null;
                    selectedCourse.selectedSectionNumber = null;
                }
            });
        }

        // Migrate schedules
        if (migratedData.schedules && Array.isArray(migratedData.schedules)) {
            migratedData.schedules.forEach((schedule: any) => {
                if (schedule.selectedCourses && Array.isArray(schedule.selectedCourses)) {
                    schedule.selectedCourses.forEach((selectedCourse: any) => {
                        // Same migration as above for schedule courses
                        if (selectedCourse.isRequired === undefined) {
                            selectedCourse.isRequired = false;
                            itemsChanged++;
                        }

                        if (selectedCourse.selectedSection) {
                            if (typeof selectedCourse.selectedSection === 'string') {
                                selectedCourse.selectedSectionNumber = selectedCourse.selectedSection;
                                selectedCourse.selectedSection = null;
                                itemsChanged++;
                            } else if (selectedCourse.selectedSection.number) {
                                selectedCourse.selectedSectionNumber = selectedCourse.selectedSection.number;
                                itemsChanged++;
                            }
                        } else {
                            selectedCourse.selectedSection = null;
                            selectedCourse.selectedSectionNumber = null;
                        }
                    });
                }
            });
        }

        // Ensure preferences have default theme if missing
        if (migratedData.preferences && !migratedData.preferences.theme) {
            migratedData.preferences.theme = 'wpi-classic';
            itemsChanged++;
        }

        // Ensure preferredDays is a Set
        if (migratedData.preferences && migratedData.preferences.preferredDays) {
            if (Array.isArray(migratedData.preferences.preferredDays)) {
                migratedData.preferences.preferredDays = new Set(migratedData.preferences.preferredDays);
                itemsChanged++;
            }
        }

        console.log(`✅ Migration 1.0 → 2.0 completed, ${itemsChanged} items changed`);
        return migratedData;
    }

    private migrate2_0To2_1(data: any): any {
        console.log('🔄 Migrating from 2.0 to 2.1...');
        let itemsChanged = 0;

        const migratedData = this.deepClone(data);
        migratedData.version = '2.1';

        // Example future migration: add new preference fields
        if (migratedData.preferences) {
            if (!migratedData.preferences.preferredBuildings) {
                migratedData.preferences.preferredBuildings = [];
                itemsChanged++;
            }
            if (!migratedData.preferences.maxWalkingTime) {
                migratedData.preferences.maxWalkingTime = 10; // minutes
                itemsChanged++;
            }
        }

        // Example: add metadata to schedules
        if (migratedData.schedules && Array.isArray(migratedData.schedules)) {
            migratedData.schedules.forEach((schedule: any) => {
                if (!schedule.metadata) {
                    schedule.metadata = {
                        createdAt: new Date().toISOString(),
                        modifiedAt: new Date().toISOString(),
                        version: '2.1'
                    };
                    itemsChanged++;
                }
            });
        }

        console.log(`✅ Migration 2.0 → 2.1 completed, ${itemsChanged} items changed`);
        return migratedData;
    }

    private detectDataVersion(data: any): string {
        return this.dataValidator.detectSchemaVersion(data);
    }

    private findMigrationPath(fromVersion: string, toVersion: string): MigrationStep[] {
        if (fromVersion === toVersion) {
            return [];
        }

        // Simple linear path for now - can be enhanced to support complex paths
        const path: MigrationStep[] = [];
        let currentVersion = fromVersion;

        while (currentVersion !== toVersion) {
            const step = this.migrationSteps.find(s => s.fromVersion === currentVersion);
            if (!step) {
                console.error(`No migration step found from version ${currentVersion}`);
                return [];
            }
            
            path.push(step);
            currentVersion = step.toVersion;

            // Prevent infinite loops
            if (path.length > 10) {
                console.error('Migration path too long, possible circular dependency');
                return [];
            }
        }

        return path;
    }

    private validateMigratedData(data: any, expectedVersion: string): ValidationResult {
        // Version-specific validation
        switch (expectedVersion) {
            case '2.0':
            case '2.1':
                return this.dataValidator.validateUserScheduleState(data, { repairInPlace: false });
            default:
                return { valid: true, errors: [], warnings: [] };
        }
    }

    private async createBackup(data: any, version: string, migrationId: string): Promise<boolean> {
        try {
            const backup = {
                version,
                timestamp: new Date().toISOString(),
                migrationId,
                data: this.deepClone(data),
                checksum: this.generateChecksum(JSON.stringify(data))
            };

            const backupKey = `${ProfileMigrationService.BACKUP_KEY_PREFIX}-${migrationId}`;
            
            const result = await this.retryManager.retryStorageOperation(
                () => {
                    localStorage.setItem(backupKey, JSON.stringify(backup));
                },
                { operationName: 'create migration backup' }
            );

            return result.success;
        } catch (error) {
            console.error('Failed to create backup:', error);
            return false;
        }
    }

    private async restoreFromBackup(migrationId: string): Promise<boolean> {
        try {
            const backupKey = `${ProfileMigrationService.BACKUP_KEY_PREFIX}-${migrationId}`;
            const backupData = localStorage.getItem(backupKey);
            
            if (!backupData) {
                console.error(`No backup found for migration ${migrationId}`);
                return false;
            }

            const backup = JSON.parse(backupData);
            
            // Verify backup integrity
            const expectedChecksum = this.generateChecksum(JSON.stringify(backup.data));
            if (backup.checksum !== expectedChecksum) {
                console.error('Backup data integrity check failed');
                return false;
            }

            // Restore data to storage
            const exportData = {
                version: backup.version,
                timestamp: backup.timestamp,
                ...backup.data
            };

            const result = this.storageManager.importData(JSON.stringify(exportData));
            if (!result.success) {
                console.error('Failed to restore backup:', result.error);
                return false;
            }

            console.log(`✅ Successfully restored from backup ${migrationId}`);
            return true;

        } catch (error) {
            console.error('Failed to restore from backup:', error);
            return false;
        }
    }

    private async logMigration(logEntry: {
        migrationId: string;
        fromVersion: string;
        toVersion: string;
        timestamp: string;
        success: boolean;
        itemsChanged: number;
        error?: string;
    }): Promise<void> {
        try {
            const existingLog = localStorage.getItem(ProfileMigrationService.MIGRATION_LOG_KEY);
            const log = existingLog ? JSON.parse(existingLog) : [];
            
            log.push(logEntry);

            // Keep only last 50 entries
            if (log.length > 50) {
                log.splice(0, log.length - 50);
            }

            localStorage.setItem(ProfileMigrationService.MIGRATION_LOG_KEY, JSON.stringify(log));
        } catch (error) {
            console.warn('Failed to log migration:', error);
        }
    }

    // Utility methods
    async getMigrationHistory(): Promise<any[]> {
        try {
            const logData = localStorage.getItem(ProfileMigrationService.MIGRATION_LOG_KEY);
            return logData ? JSON.parse(logData) : [];
        } catch (error) {
            console.warn('Failed to load migration history:', error);
            return [];
        }
    }

    async cleanupOldBackups(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
        let cleanedCount = 0;
        const cutoffTime = Date.now() - maxAge;

        try {
            const keys = Object.keys(localStorage);
            const backupKeys = keys.filter(key => key.startsWith(ProfileMigrationService.BACKUP_KEY_PREFIX));

            for (const key of backupKeys) {
                try {
                    const backupData = localStorage.getItem(key);
                    if (backupData) {
                        const backup = JSON.parse(backupData);
                        const backupTime = new Date(backup.timestamp).getTime();
                        
                        if (backupTime < cutoffTime) {
                            localStorage.removeItem(key);
                            cleanedCount++;
                        }
                    }
                } catch (error) {
                    // If we can't parse the backup, remove it
                    localStorage.removeItem(key);
                    cleanedCount++;
                }
            }

            console.log(`🧹 Cleaned up ${cleanedCount} old migration backups`);
        } catch (error) {
            console.warn('Failed to cleanup old backups:', error);
        }

        return cleanedCount;
    }

    isVersionSupported(version: string): boolean {
        const supportedVersions = ['1.0', '2.0', '2.1'];
        return supportedVersions.includes(version);
    }

    getCurrentVersion(): string {
        return ProfileMigrationService.CURRENT_VERSION;
    }

    // Private utility methods
    private deepClone(obj: any): any {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Set) return new Set([...obj]);
        if (obj instanceof Map) return new Map([...obj]);
        if (Array.isArray(obj)) return obj.map(item => this.deepClone(item));
        
        const cloned: any = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = this.deepClone(obj[key]);
            }
        }
        return cloned;
    }

    private generateChecksum(data: string): string {
        let hash = 0;
        if (data.length === 0) return hash.toString();
        
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        
        return hash.toString();
    }

    private generateMigrationId(): string {
        return `migration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}