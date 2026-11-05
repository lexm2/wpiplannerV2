/**
 * Tells other tabs of this browser profile what this tab wrote, so they can
 * refresh instead of overwriting it from a stale in-memory copy.
 *
 * BroadcastChannel where it exists; otherwise a localStorage key whose
 * `storage` event fires in every other tab (never the writer's own).
 */
import { STORAGE_KEYS } from '../../utils/storageKeys';
import { logger } from '../../utils/logger';

export type CrossTabMessage =
  | { type: 'schedule'; id: string }
  | { type: 'deleted'; id: string }
  | { type: 'cleared' };

const CHANNEL_NAME = 'wpi-planner-storage';

function isMessage(value: unknown): value is CrossTabMessage {
  if (!value || typeof value !== 'object') return false;
  const { type, id } = value as { type?: unknown; id?: unknown };
  if (type === 'cleared') return true;
  return (type === 'schedule' || type === 'deleted') && typeof id === 'string';
}

export class CrossTabChannel {
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<(message: CrossTabMessage) => void>();

  constructor() {
    if (typeof window === 'undefined') return;
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = event => this.dispatch(event.data);
    } else {
      window.addEventListener('storage', event => {
        if (event.key !== STORAGE_KEYS.TAB_SYNC || !event.newValue) return;
        try {
          this.dispatch(
            (JSON.parse(event.newValue) as { message?: unknown }).message,
          );
        } catch {
          // A foreign value under our key is not a message.
        }
      });
    }
  }

  post(message: CrossTabMessage): void {
    try {
      if (this.channel) {
        this.channel.postMessage(message);
      } else if (typeof localStorage !== 'undefined') {
        // The nonce makes two identical messages in a row still a change.
        localStorage.setItem(
          STORAGE_KEYS.TAB_SYNC,
          JSON.stringify({ nonce: Math.random(), message }),
        );
      }
    } catch (error) {
      logger.warn('Could not notify other tabs:', error);
    }
  }

  subscribe(listener: (message: CrossTabMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private dispatch(data: unknown): void {
    if (!isMessage(data)) return;
    for (const listener of this.listeners) listener(data);
  }
}
