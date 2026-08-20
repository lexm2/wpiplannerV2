import type { TransactionalStorageManager } from '../../core/storage/TransactionalStorageManager';
import type { StudentRecord } from '../../types/degree';
import { degreeState } from '../../svelte/degree/degreeState.svelte';
import { logger } from '../../utils/logger'

/**
 * Orchestrates importing, persisting, and loading the Workday "View My Academic
 * Progress" export. The UI talks only to this service; the xlsx reader + parser
 * (and the ~8KB fflate dependency) are loaded lazily on first import so they
 * never weigh down the main planner bundle.
 */
export class DegreeImportService {
    constructor(private readonly storage: TransactionalStorageManager) {}

    async importFromFile(file: File): Promise<StudentRecord> {
        degreeState.status = 'parsing';
        degreeState.errorMessage = null;
        try {
            const [{ readSheet }, { parseAcademicProgress }] = await Promise.all([
                import('./xlsxReader'),
                import('./academicProgressParser'),
            ]);

            const buf = await file.arrayBuffer();
            const rows = readSheet(buf);
            const record = parseAcademicProgress(rows);

            if (!record.requirements.length) {
                throw new Error('No degree requirements found — is this a "View My Academic Progress" export?');
            }

            degreeState.record = record;
            degreeState.status = 'ready';
            this.storage.saveDegreeRecord(record);
            return record;
        } catch (error) {
            degreeState.status = 'error';
            degreeState.errorMessage =
                error instanceof Error ? error.message : 'Failed to read the file. Make sure it is an .xlsx export.';
            throw error;
        }
    }

    /** Rehydrate a previously-imported record at startup; validates the schema. */
    async load(): Promise<void> {
        const result = this.storage.loadDegreeRecord();
        if (!result.valid || !result.data) return;
        try {
            const { isValidStudentRecord } = await import('./academicProgressParser');
            if (isValidStudentRecord(result.data)) {
                degreeState.record = result.data;
                degreeState.status = 'ready';
            } else {
                // Stale/incompatible schema — drop it rather than crash.
                logger.warn('Discarding incompatible stored degree record');
                this.storage.saveDegreeRecord(null);
            }
        } catch (error) {
            logger.warn('Failed to validate stored degree record:', error);
        }
    }

    clear(): void {
        degreeState.record = null;
        degreeState.status = 'empty';
        degreeState.errorMessage = null;
        this.storage.saveDegreeRecord(null);
    }
}
