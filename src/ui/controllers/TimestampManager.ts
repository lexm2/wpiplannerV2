import { timestampState } from '../../svelte/timestampState.svelte';

const TIMESTAMP_FORMAT: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
};

function formatTimestamp(date: Date): string {
    return date.toLocaleDateString('en-US', TIMESTAMP_FORMAT).replace(',', ' at');
}

export class TimestampManager {
    updateClientTimestamp(): void {
        timestampState.clientLabel = `Client loaded: ${formatTimestamp(new Date())}`;
    }

    async loadServerTimestamp(): Promise<string | null> {
        try {
            const response = await fetch('./last-updated.json', { cache: 'no-cache' });

            if (response.ok) {
                const timestampData = await response.json();
                timestampState.serverLabel = `Server updated: ${formatTimestamp(new Date(timestampData.timestamp))}`;
                return timestampData.timestamp;
            }
            throw new Error(`Failed to fetch server timestamp: ${response.status}`);
        } catch (error) {
            console.warn('Failed to load server timestamp:', error);
            timestampState.serverLabel = 'Server timestamp unavailable';
            return null;
        }
    }
}
