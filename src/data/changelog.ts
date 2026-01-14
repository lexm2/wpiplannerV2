import type { Changelog } from '../types/changelog';

/**
 * Application changelog organized by date (newest first).
 * Add new entries at the TOP to maintain order.
 */
export const CHANGELOG: Changelog = [
    {
        date: '2026-01-14',
        changes: [
            'Added changelog modal to display on every boot',
        ],
    },
];
