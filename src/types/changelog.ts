/**
 * Represents a single changelog entry with a date and list of changes
 */
export interface ChangelogEntry {
    /** Release date in ISO format (YYYY-MM-DD) */
    date: string;
    /** List of changes for this release */
    changes: string[];
}

/**
 * Complete changelog - array of entries organized by date (newest first)
 */
export type Changelog = ChangelogEntry[];
