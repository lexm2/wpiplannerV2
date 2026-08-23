import { logger } from '../utils/logger';
/**
 * Reactive home for the header's "client loaded" / "server updated" labels,
 * plus the functions that set them (formerly the TimestampManager class).
 * App.svelte renders the runes, so no vanilla code reaches into the component
 * tree.
 */
class TimestampState {
  clientLabel = $state('Loading client data...');
  serverLabel = $state('Loading server data...');
}

export const timestampState = new TimestampState();

const TIMESTAMP_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
};

function formatTimestamp(date: Date): string {
  return date.toLocaleDateString('en-US', TIMESTAMP_FORMAT).replace(',', ' at');
}

export function updateClientTimestamp(): void {
  timestampState.clientLabel = `Client loaded: ${formatTimestamp(new Date())}`;
}

export async function loadServerTimestamp(): Promise<string | null> {
  try {
    const response = await fetch('./last-updated.json', { cache: 'no-cache' });

    if (response.ok) {
      const timestampData = await response.json();
      timestampState.serverLabel = `Server updated: ${formatTimestamp(new Date(timestampData.timestamp))}`;
      return timestampData.timestamp;
    }
    throw new Error(`Failed to fetch server timestamp: ${response.status}`);
  } catch (error) {
    logger.warn('Failed to load server timestamp:', error);
    timestampState.serverLabel = 'Server timestamp unavailable';
    return null;
  }
}
