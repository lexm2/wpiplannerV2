/**
 * Data export/import format types
 *
 * These types define the compact format used for local data export/import.
 */

/**
 * Minimal format for compact data export (v4)
 * Optimized for size with abbreviated keys
 */
export interface MinimalSyncData {
    v: string;
    a: number | null;
    s: [string, (string | null)[]][];
    p?: {
        t: [number, number];
        d: number[];
        th?: string;
    };
}