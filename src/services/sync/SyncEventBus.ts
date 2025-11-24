import type { SyncEvent, SyncEventType, SyncEventListener } from './types';

/**
 * Centralized event bus for all sync-related events.
 * Singleton pattern ensures all components use the same instance.
 */
export class SyncEventBus {
    private static instance: SyncEventBus;
    private listeners = new Map<SyncEventType | '*', Set<SyncEventListener>>();
    private debugEnabled = false;

    private constructor() {}

    static getInstance(): SyncEventBus {
        if (!SyncEventBus.instance) {
            SyncEventBus.instance = new SyncEventBus();
        }
        return SyncEventBus.instance;
    }

    /**
     * Enable or disable debug logging
     */
    setDebugEnabled(enabled: boolean): void {
        this.debugEnabled = enabled;
    }

    private log(message: string, ...args: unknown[]): void {
        if (this.debugEnabled) {
            console.log(`[SyncEventBus] ${message}`, ...args);
        }
    }

    /**
     * Subscribe to a specific event type or all events ('*')
     */
    on(eventType: SyncEventType | '*', listener: SyncEventListener): () => void {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType)!.add(listener);
        this.log(`Subscribed to '${eventType}'`);

        // Return unsubscribe function
        return () => this.off(eventType, listener);
    }

    /**
     * Unsubscribe from an event type
     */
    off(eventType: SyncEventType | '*', listener: SyncEventListener): void {
        const listeners = this.listeners.get(eventType);
        if (listeners) {
            listeners.delete(listener);
            this.log(`Unsubscribed from '${eventType}'`);
        }
    }

    /**
     * Emit an event to all subscribers
     */
    emit(event: SyncEvent): void {
        const specificListeners = this.listeners.get(event.type);
        const wildcardListeners = this.listeners.get('*');

        this.log(`Emitting '${event.type}'`, event.data);

        // Notify specific event listeners
        specificListeners?.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                console.error(`[SyncEventBus] Error in listener for ${event.type}:`, error);
            }
        });

        // Notify wildcard listeners
        wildcardListeners?.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                console.error(`[SyncEventBus] Error in wildcard listener:`, error);
            }
        });
    }

    /**
     * Helper to emit an event with just type and optional data
     */
    emitEvent(type: SyncEventType, data?: unknown, error?: Error): void {
        this.emit({
            type,
            timestamp: Date.now(),
            data,
            error
        });
    }

    /**
     * Remove all listeners
     */
    clear(): void {
        this.listeners.clear();
        this.log('Cleared all listeners');
    }
}

// Export singleton instance
export const syncEventBus = SyncEventBus.getInstance();
