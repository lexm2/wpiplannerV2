import type { SyncEvent, SyncEventType, SyncEventListener } from './CloudSyncTypes';

/**
 * Centralized event bus for all sync-related events.
 * Singleton pattern ensures all components use the same instance.
 */
export class SyncEventBus {
    private static instance: SyncEventBus;
    private listeners = new Map<SyncEventType | '*', Set<SyncEventListener>>();

    private constructor() {}

    static getInstance(): SyncEventBus {
        if (!SyncEventBus.instance) {
            SyncEventBus.instance = new SyncEventBus();
        }
        return SyncEventBus.instance;
    }

    /**
     * Subscribe to a specific event type or all events ('*')
     */
    on(eventType: SyncEventType | '*', listener: SyncEventListener): void {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType)!.add(listener);
    }

    /**
     * Unsubscribe from an event type
     */
    off(eventType: SyncEventType | '*', listener: SyncEventListener): void {
        const listeners = this.listeners.get(eventType);
        if (listeners) {
            listeners.delete(listener);
        }
    }

    /**
     * Emit an event to all subscribers
     */
    emit(event: SyncEvent): void {
        // Notify specific event listeners
        const specificListeners = this.listeners.get(event.type);
        if (specificListeners) {
            specificListeners.forEach(listener => {
                try {
                    listener(event);
                } catch (error) {
                    console.error(`[SyncEventBus] Error in listener for ${event.type}:`, error);
                }
            });
        }

        // Notify wildcard listeners
        const wildcardListeners = this.listeners.get('*');
        if (wildcardListeners) {
            wildcardListeners.forEach(listener => {
                try {
                    listener(event);
                } catch (error) {
                    console.error(`[SyncEventBus] Error in wildcard listener:`, error);
                }
            });
        }
    }

    /**
     * Helper to emit an event with just type and optional data
     */
    emitEvent(type: SyncEventType, data?: any, error?: Error): void {
        this.emit({
            type,
            timestamp: Date.now(),
            data,
            error
        });
    }

    /**
     * Remove all listeners (useful for testing)
     */
    clear(): void {
        this.listeners.clear();
    }
}

// Export singleton instance for convenience
export const syncEventBus = SyncEventBus.getInstance();
