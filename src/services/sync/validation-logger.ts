import type { ValidationError } from './schemas';

/**
 * Validation Event Types
 */
export type ValidationEventType =
    | 'validation_start'
    | 'validation_success'
    | 'validation_failure'
    | 'schema_error'
    | 'conversion_error'
    | 'checksum_invalid'
    | 'checksum_mismatch';

/**
 * Validation Context
 */
export interface ValidationContext {
    source: string;
    operation: string;
    timestamp: number;
}

/**
 * Validation Event
 */
export interface ValidationEvent {
    type: ValidationEventType;
    context: ValidationContext;
    details?: Record<string, unknown>;
    error?: Error;
}

/**
 * Validation Logger
 *
 * Provides structured logging for all validation operations in the cloud sync system.
 * Logs are prefixed with [Validation] for easy filtering in console.
 *
 * Usage:
 * ```typescript
 * const logger = new ValidationLogger('GoogleDriveProvider', 'pull');
 * logger.logStart();
 * try {
 *     const validated = SyncDataSchema.parse(data);
 *     logger.logSuccess({ schedules: validated.schedules.length });
 * } catch (error) {
 *     logger.logFailure(error);
 * }
 * ```
 */
export class ValidationLogger {
    private context: ValidationContext;

    constructor(source: string, operation: string) {
        this.context = {
            source,
            operation,
            timestamp: Date.now()
        };
    }

    /**
     * Log validation start
     */
    logStart(): void {
        console.log(`[Validation] Starting validation: ${this.context.source} / ${this.context.operation}`);
    }

    /**
     * Log validation success
     *
     * @param details - Additional details to log
     */
    logSuccess(details?: Record<string, unknown>): void {
        console.log(`[Validation] ✓ ${this.context.source} / ${this.context.operation} - Success`);
        if (details) {
            Object.entries(details).forEach(([key, value]) => {
                console.log(`[Validation]   ${key}: ${value}`);
            });
        }
    }

    /**
     * Log validation failure
     *
     * @param error - Error that caused failure
     */
    logFailure(error: Error | ValidationError): void {
        console.error(`[Validation] ✗ ${this.context.source} / ${this.context.operation} - Failed`);
        console.error(`[Validation]   Error: ${error.message}`);

        // If Zod ValidationError, log detailed field errors
        if ('errors' in error && Array.isArray(error.errors)) {
            error.errors.forEach((err, index) => {
                console.error(`[Validation]   Field Error ${index + 1}:`, {
                    path: err.path.join('.'),
                    message: err.message,
                    code: err.code,
                    received: 'received' in err ? err.received : undefined
                });
            });
        }
    }

    /**
     * Log schema validation error
     *
     * @param error - Zod validation error
     * @param data - Original data that failed validation
     */
    logSchemaError(error: ValidationError, data: unknown): void {
        console.error(`[Validation] ✗ Schema validation failed: ${this.context.source}`);
        console.error(`[Validation]   Operation: ${this.context.operation}`);
        console.error(`[Validation]   Errors: ${error.errors.length}`);

        error.errors.forEach((err, index) => {
            console.error(`[Validation]   Error ${index + 1}:`, {
                path: err.path.join('.') || 'root',
                message: err.message,
                code: err.code,
                received: 'received' in err ? err.received : undefined,
                expected: 'expected' in err ? err.expected : undefined
            });
        });

        // Log a sample of the data for debugging (truncate if too large)
        const dataStr = JSON.stringify(data, null, 2);
        const dataSample = dataStr.length > 500 ? dataStr.substring(0, 500) + '...' : dataStr;
        console.error(`[Validation]   Data Sample:`, dataSample);
    }

    /**
     * Log conversion error
     *
     * @param error - Conversion error
     * @param courseId - Course ID that failed conversion
     */
    logConversionError(error: Error, courseId?: string): void {
        console.error(`[Validation] ✗ Conversion failed: ${this.context.source}`);
        console.error(`[Validation]   Operation: ${this.context.operation}`);
        if (courseId) {
            console.error(`[Validation]   Course ID: ${courseId}`);
        }
        console.error(`[Validation]   Error: ${error.message}`);
    }

    /**
     * Log checksum validation failure
     *
     * @param expected - Expected checksum
     * @param calculated - Calculated checksum
     * @param error - Type of checksum error
     */
    logChecksumError(
        expected: string,
        calculated?: string,
        error: 'INVALID_FORMAT' | 'MISMATCH' = 'MISMATCH'
    ): void {
        console.error(`[Validation] ✗ Checksum ${error === 'INVALID_FORMAT' ? 'format invalid' : 'mismatch'}`);
        console.error(`[Validation]   Source: ${this.context.source}`);
        console.error(`[Validation]   Expected: ${expected} (${expected.length} chars)`);
        if (calculated) {
            console.error(`[Validation]   Calculated: ${calculated} (${calculated.length} chars)`);
        }

        if (error === 'INVALID_FORMAT') {
            console.warn(`[Validation]   ⚠ Checksum format is invalid (expected 64-char SHA-256)`);
            console.warn(`[Validation]   ⚠ This may indicate corrupted or old format data`);
        } else {
            console.warn(`[Validation]   ⚠ Data integrity check failed - data may be corrupted`);
        }
    }

    /**
     * Log warning
     *
     * @param message - Warning message
     * @param details - Additional details
     */
    logWarning(message: string, details?: Record<string, unknown>): void {
        console.warn(`[Validation] ⚠ ${this.context.source}: ${message}`);
        if (details) {
            Object.entries(details).forEach(([key, value]) => {
                console.warn(`[Validation]   ${key}: ${value}`);
            });
        }
    }

    /**
     * Log info message
     *
     * @param message - Info message
     * @param details - Additional details
     */
    logInfo(message: string, details?: Record<string, unknown>): void {
        console.log(`[Validation] ${this.context.source}: ${message}`);
        if (details) {
            Object.entries(details).forEach(([key, value]) => {
                console.log(`[Validation]   ${key}: ${value}`);
            });
        }
    }

    /**
     * Create event object for external handling
     *
     * @param type - Event type
     * @param details - Event details
     * @param error - Error if applicable
     * @returns Validation event object
     */
    createEvent(
        type: ValidationEventType,
        details?: Record<string, unknown>,
        error?: Error
    ): ValidationEvent {
        return {
            type,
            context: this.context,
            details,
            error
        };
    }
}

/**
 * Helper: Create logger for common operations
 */
export function createValidationLogger(source: string, operation: string): ValidationLogger {
    return new ValidationLogger(source, operation);
}
