/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ProfileMigrationService - Data Schema Migration & Version Compatibility System
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ARCHITECTURE ROLE:
 * - Handles migration between different storage formats for application updates
 * - Ensures data compatibility during application version transitions
 * - Safely transitions users from old to new storage systems with data preservation
 * - Provides rollback capabilities for failed migrations with automatic recovery
 * - Foundation for schema evolution and backward compatibility support
 * 
 * DEPENDENCIES:
 * - DataValidator → Schema validation and data integrity verification
 * - TransactionalStorageManager → Atomic storage operations during migration
 * - RetryManager → Resilient migration operations with automatic retry
 * - Schedule, SelectedCourse, SchedulePreferences types → Data model validation
 * - ValidationResult interface → Migration validation result reporting
 * 
 * USED BY:
 * - ProfileStateManager → Data loading with automatic migration for legacy data
 * - TransactionalStorageManager → Storage loading with version compatibility
 * - Application initialization → Automatic data migration on startup
 * - Import/Export systems → Cross-version data compatibility
 * - Data recovery operations → Safe restoration from backups
 * 
 * MIGRATION ARCHITECTURE:
 * ```
 * Legacy Data Detection
 *         ↓
 * Version Analysis & Migration Path Planning
 *         ↓
 * Backup Creation (with integrity verification)
 *         ↓
 * Sequential Migration Steps (with validation)
 *         ↓
 * Final Data Validation
 *         ↓
 * Rollback on Failure OR Commit on Success
 * ```
 * 
 * KEY FEATURES:
 * Automatic Migration System:
 * - migrateToLatest() automatically upgrades data to current schema version
 * - migrateFromTo() provides custom version migration paths
 * - Version detection through DataValidator.detectSchemaVersion()
 * - Sequential migration steps with individual validation
 * - Comprehensive error handling with automatic rollback
 * 
 * Migration Step Architecture:
 * - MigrationStep interface defines structured migration operations
 * - Each step includes migrate(), validate(), and rollback() methods
 * - Linear migration path with version progression tracking
 * - Individual step validation with DataValidator integration
 * - Automatic rollback capabilities for failed migration steps
 * 
 * Data Safety & Integrity:
 * - createBackup() generates integrity-verified backups before migration
 * - Checksum verification for backup data integrity
 * - restoreFromBackup() provides automatic recovery on migration failure
 * - TransactionalStorageManager integration for atomic operations
 * - RetryManager integration for resilient migration operations
 * 
 * Schema Migration Examples:
 * - migrate1_0To2_0() adds selectedSectionNumber field and structure improvements
 * - migrate2_0To2_1() adds new preference fields and metadata optimization
 * - Structured migration with item change tracking
 * - Deep cloning for safe data transformation
 * 
 * SPECIFIC MIGRATION IMPLEMENTATIONS:
 * Version 1.0 → 2.0 Migration:
 * - Add selectedSectionNumber field alongside selectedSection object
 * - Ensure isRequired boolean field exists for all selected courses
 * - Handle selectedSection string-to-object migration
 * - Add default theme preference if missing
 * - Convert preferredDays arrays to Sets for consistency
 * - Process both standalone and schedule-embedded course selections
 * 
 * Version 2.0 → 2.1 Migration (Future):
 * - Add preferredBuildings array for location preferences
 * - Add maxWalkingTime preference for schedule optimization
 * - Add metadata fields to schedules (created/modified timestamps)
 * - Example of extensible migration architecture
 * 
 * BACKUP & RECOVERY SYSTEM:
 * Backup Creation:
 * - Automatic backup before any migration attempt
 * - Integrity checksums for backup verification
 * - Timestamped backup identification
 * - Storage-retry integration for reliable backup creation
 * 
 * Recovery Operations:
 * - restoreFromBackup() with integrity verification
 * - Automatic recovery on migration failure
 * - Backup cleanup with configurable age limits
 * - Migration history logging for audit trails
 * 
 * MIGRATION PATH PLANNING:
 * - findMigrationPath() determines sequential upgrade steps
 * - Linear path planning from source to target version
 * - Circular dependency detection and prevention
 * - Support for complex multi-step migration sequences
 * - Version compatibility checking with supported version list
 * 
 * VALIDATION INTEGRATION:
 * - Step-by-step validation during migration process
 * - Final validation of migrated data against target schema
 * - DataValidator integration for consistent validation rules
 * - Warning collection and error reporting
 * - Repair-in-place option for minor data inconsistencies
 * 
 * ERROR HANDLING & MONITORING:
 * - Comprehensive error collection with detailed messages
 * - Migration result reporting with success/failure status
 * - Item change counting for migration impact assessment
 * - Migration history logging with success/failure tracking
 * - Automatic rollback with error preservation
 * 
 * UTILITY FEATURES:
 * Migration History:
 * - getMigrationHistory() provides audit trail of all migrations
 * - Timestamped migration log with success/failure status
 * - Item change tracking for migration impact analysis
 * - Limited log retention (50 entries) for memory efficiency
 * 
 * Backup Management:
 * - cleanupOldBackups() removes expired backup data
 * - Configurable retention period (default 30 days)
 * - Storage space optimization through automatic cleanup
 * - Error-resilient cleanup with invalid backup removal
 * 
 * Version Compatibility:
 * - isVersionSupported() validates version compatibility
 * - getCurrentVersion() provides current schema version
 * - Supported version list for compatibility checking
 * 
 * ARCHITECTURAL PATTERNS:
 * - Strategy: Configurable migration strategies per version transition
 * - Template Method: Consistent migration workflow across all versions
 * - Command: Migration steps as discrete, reversible operations
 * - State: Version-aware data transformation with state preservation
 * - Observer: Result reporting with detailed success/failure information
 * 
 * BENEFITS ACHIEVED:
 * - Seamless data migration during application updates
 * - Data preservation across schema changes and format updates
 * - Automatic rollback prevents data corruption during failed migrations
 * - Comprehensive validation ensures data integrity after migration
 * - Audit trail provides migration history for troubleshooting
 * - Extensible architecture supports future schema evolution
 * - User-transparent migration with minimal disruption
 * 
 * INTEGRATION NOTES:
 * - Designed for ProfileStateManager initialization workflow
 * - Integrates with TransactionalStorageManager for atomic operations
 * - Uses DataValidator for consistent validation rules
 * - RetryManager provides resilient migration operations
 * - Supports import/export workflows with version compatibility
 * 
 * FUTURE EXTENSIBILITY:
 * - Additional migration steps easily added to migrationSteps array
 * - Complex migration path planning for non-linear version jumps
 * - Enhanced rollback strategies with partial migration support
 * - Migration performance optimization for large datasets
 * - Advanced backup strategies with compression and encryption
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */
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