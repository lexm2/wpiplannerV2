import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { SyncEventBus } from '../../../src/services/sync/SyncEventBus';
import type { SyncEvent, SyncEventType } from '../../../src/services/sync/types';

describe('SyncEventBus', () => {
    let eventBus: SyncEventBus;

    beforeEach(() => {
        eventBus = SyncEventBus.getInstance();
        eventBus.clear();
    });

    describe('Event Emission', () => {
        it('should emit auth-changed event', () => {
            const listener = mock();
            eventBus.on('auth-changed', listener);

            eventBus.emitEvent('auth-changed', { authenticated: true });

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'auth-changed',
                    data: { authenticated: true },
                })
            );
        });

        it('should emit sync-conflict event', () => {
            const listener = mock();
            eventBus.on('sync-conflict', listener);

            const conflictData = {
                hasConflict: true,
                localData: {} as any,
                cloudData: {} as any,
                differences: { courses: true, sections: false },
            };

            eventBus.emitEvent('sync-conflict', conflictData);

            expect(listener).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'sync-conflict',
                    data: conflictData,
                })
            );
        });

        it('should emit sync-resolved event', () => {
            const listener = mock();
            eventBus.on('sync-resolved', listener);

            eventBus.emitEvent('sync-resolved', { resolution: 'local' });

            expect(listener).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'sync-resolved',
                    data: { resolution: 'local' },
                })
            );
        });

        it('should emit sync-pushed event', () => {
            const listener = mock();
            eventBus.on('sync-pushed', listener);

            eventBus.emitEvent('sync-pushed', { source: 'initial' });

            expect(listener).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'sync-pushed',
                    data: { source: 'initial' },
                })
            );
        });

        it('should emit sync-failed event with error', () => {
            const listener = mock();
            eventBus.on('sync-failed', listener);

            const error = new Error('Network error');
            eventBus.emitEvent('sync-failed', undefined, error);

            expect(listener).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'sync-failed',
                    error,
                })
            );
        });

        it('should emit sync-started event', () => {
            const listener = mock();
            eventBus.on('sync-started', listener);

            eventBus.emitEvent('sync-started');

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'sync-started',
                })
            );
        });

        it('should emit local-save-completed event', () => {
            const listener = mock();
            eventBus.on('local-save-completed', listener);

            eventBus.emitEvent('local-save-completed');

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('should emit offline-mode event', () => {
            const listener = mock();
            eventBus.on('offline-mode', listener);

            eventBus.emitEvent('offline-mode');

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('should emit online-mode event', () => {
            const listener = mock();
            eventBus.on('online-mode', listener);

            eventBus.emitEvent('online-mode');

            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    describe('Event Listeners', () => {
        it('should register and call listener', () => {
            const listener = mock();
            eventBus.on('auth-changed', listener);

            eventBus.emitEvent('auth-changed', { authenticated: false });

            expect(listener).toHaveBeenCalled();
        });

        it('should support multiple listeners for same event', () => {
            const listener1 = mock();
            const listener2 = mock();

            eventBus.on('sync-pushed', listener1);
            eventBus.on('sync-pushed', listener2);

            eventBus.emitEvent('sync-pushed', { source: 'manual' });

            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledTimes(1);
        });

        it('should support wildcard listener for all events', () => {
            const wildcard = mock();
            eventBus.on('*', wildcard);

            eventBus.emitEvent('auth-changed');
            eventBus.emitEvent('sync-pushed');
            eventBus.emitEvent('sync-failed');

            expect(wildcard).toHaveBeenCalledTimes(3);
        });

        it('should return unsubscribe function', () => {
            const listener = mock();
            const unsubscribe = eventBus.on('sync-pushed', listener);

            eventBus.emitEvent('sync-pushed');
            expect(listener).toHaveBeenCalledTimes(1);

            unsubscribe();
            eventBus.emitEvent('sync-pushed');
            expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
        });

        it('should remove listener with off()', () => {
            const listener = mock();
            eventBus.on('auth-changed', listener);

            eventBus.emitEvent('auth-changed');
            expect(listener).toHaveBeenCalledTimes(1);

            eventBus.off('auth-changed', listener);
            eventBus.emitEvent('auth-changed');
            expect(listener).toHaveBeenCalledTimes(1); // Not called again
        });

        it('should clear all listeners', () => {
            const listener1 = mock();
            const listener2 = mock();

            eventBus.on('auth-changed', listener1);
            eventBus.on('sync-pushed', listener2);

            eventBus.clear();

            eventBus.emitEvent('auth-changed');
            eventBus.emitEvent('sync-pushed');

            expect(listener1).not.toHaveBeenCalled();
            expect(listener2).not.toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should isolate listener errors', () => {
            const errorListener = mock(() => {
                throw new Error('Listener error');
            });
            const goodListener = mock();

            eventBus.on('auth-changed', errorListener);
            eventBus.on('auth-changed', goodListener);

            // Should not throw
            expect(() => {
                eventBus.emitEvent('auth-changed');
            }).not.toThrow();

            // Good listener should still be called
            expect(goodListener).toHaveBeenCalled();
        });

        it('should continue emitting to other listeners after error', () => {
            const listeners = [
                mock(() => {
                    throw new Error('Error 1');
                }),
                mock(),
                mock(() => {
                    throw new Error('Error 2');
                }),
                mock(),
            ];

            listeners.forEach((l) => eventBus.on('sync-pushed', l));

            eventBus.emitEvent('sync-pushed');

            // All listeners should have been called despite errors
            listeners.forEach((l) => {
                expect(l).toHaveBeenCalled();
            });
        });
    });

    describe('Event Payload Structure', () => {
        it('should include timestamp in all events', () => {
            const listener = mock();
            eventBus.on('sync-pushed', listener);

            const beforeTimestamp = Date.now();
            eventBus.emitEvent('sync-pushed');
            const afterTimestamp = Date.now();

            const event = listener.mock.calls[0][0] as SyncEvent;
            expect(event.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
            expect(event.timestamp).toBeLessThanOrEqual(afterTimestamp);
        });

        it('should preserve data payload', () => {
            const listener = mock();
            eventBus.on('sync-conflict', listener);

            const payload = { test: 'data', nested: { value: 123 } };
            eventBus.emitEvent('sync-conflict', payload);

            const event = listener.mock.calls[0][0] as SyncEvent;
            expect(event.data).toEqual(payload);
        });

        it('should preserve error object', () => {
            const listener = mock();
            eventBus.on('sync-failed', listener);

            const error = new Error('Test error');
            error.stack = 'test stack';
            eventBus.emitEvent('sync-failed', undefined, error);

            const event = listener.mock.calls[0][0] as SyncEvent;
            expect(event.error).toBe(error);
            expect(event.error?.message).toBe('Test error');
        });
    });

    describe('Singleton Pattern', () => {
        it('should return same instance', () => {
            const instance1 = SyncEventBus.getInstance();
            const instance2 = SyncEventBus.getInstance();

            expect(instance1).toBe(instance2);
        });

        it('should share listeners across getInstance() calls', () => {
            const listener = mock();

            const instance1 = SyncEventBus.getInstance();
            instance1.on('auth-changed', listener);

            const instance2 = SyncEventBus.getInstance();
            instance2.emitEvent('auth-changed');

            expect(listener).toHaveBeenCalled();
        });
    });

    describe('Debug Mode', () => {
        it('should enable debug logging', () => {
            const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});

            eventBus.setDebugEnabled(true);
            eventBus.emitEvent('auth-changed');

            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        it('should disable debug logging', () => {
            const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});

            eventBus.setDebugEnabled(false);
            eventBus.emitEvent('auth-changed');

            // Should not log events when debug is disabled
            expect(consoleSpy).not.toHaveBeenCalledWith(
                expect.stringContaining('[SyncEventBus]')
            );

            consoleSpy.mockRestore();
        });
    });
});
