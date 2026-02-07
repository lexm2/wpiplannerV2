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

/**
 * Helper functions for time/day conversion
 */
export function dayToNumber(day: string): number {
    const days: Record<string, number> = {
        'mon': 0, 'tue': 1, 'wed': 2, 'thu': 3, 'fri': 4, 'sat': 5, 'sun': 6
    };
    return days[day] ?? 0;
}

export function numberToDay(num: number): string {
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    return days[num] ?? 'mon';
}

export function minutesToTime(minutes: number): { hours: number; minutes: number } {
    return {
        hours: Math.floor(minutes / 60),
        minutes: minutes % 60
    };
}
