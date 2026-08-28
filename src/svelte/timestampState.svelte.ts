import { z } from 'zod';
import { logger } from '../utils/logger';
/**
 * Reactive home for the header's "client loaded" / "server updated" labels,
 * plus the functions that set them. App.svelte renders the runes.
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

// public/last-updated.json, rewritten by the deploy job every 15 minutes.
const LastUpdatedSchema = z.object({ timestamp: z.string() });

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
      const { timestamp } = LastUpdatedSchema.parse(await response.json());
      timestampState.serverLabel = `Server updated: ${formatTimestamp(new Date(timestamp))}`;
      return timestamp;
    }
    throw new Error(`Failed to fetch server timestamp: ${response.status}`);
  } catch (error) {
    logger.warn('Failed to load server timestamp:', error);
    timestampState.serverLabel = 'Server timestamp unavailable';
    return null;
  }
}
