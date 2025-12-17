import { mock } from 'bun:test';

interface Timer {
    callback: Function;
    delay: number;
    id: number;
    scheduledTime: number;
}

/**
 * Bun-compatible timer mock utility.
 * Replaces vi.useFakeTimers() / jest fake timers.
 *
 * Usage:
 * ```typescript
 * const timerMock = createTimerMock();
 *
 * beforeEach(() => {
 *     timerMock.install();
 * });
 *
 * afterEach(() => {
 *     timerMock.restore();
 * });
 *
 * it('should debounce', () => {
 *     scheduleDebounce();
 *     timerMock.advanceTimersByTime(3000);
 *     expect(callback).toHaveBeenCalled();
 * });
 * ```
 */
export function createTimerMock() {
    const timers: Timer[] = [];
    let nextId = 1;
    let currentTime = 0;

    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    const originalWindowSetTimeout = typeof window !== 'undefined' ? window.setTimeout : undefined;
    const originalWindowClearTimeout = typeof window !== 'undefined' ? window.clearTimeout : undefined;

    let installed = false;

    return {
        /**
         * Install fake timers, replacing setTimeout/clearTimeout/setInterval/clearInterval
         * Also patches window.setTimeout/window.clearTimeout for browser-like code
         */
        install() {
            if (installed) return;
            installed = true;
            currentTime = 0;
            timers.length = 0;

            const fakeSetTimeout = mock((cb: Function, delay: number = 0, ...args: any[]) => {
                const id = nextId++;
                timers.push({
                    callback: () => cb(...args),
                    delay,
                    id,
                    scheduledTime: currentTime + delay
                });
                return id;
            }) as any;

            const fakeClearTimeout = mock((id: number) => {
                const idx = timers.findIndex(t => t.id === id);
                if (idx !== -1) timers.splice(idx, 1);
            }) as any;

            globalThis.setTimeout = fakeSetTimeout;
            globalThis.clearTimeout = fakeClearTimeout;

            // Also patch window if it exists (for browser-like environments)
            if (typeof window !== 'undefined') {
                (window as any).setTimeout = fakeSetTimeout;
                (window as any).clearTimeout = fakeClearTimeout;
            }

            globalThis.setInterval = mock((cb: Function, delay: number = 0, ...args: any[]) => {
                const id = nextId++;
                const intervalCallback = () => {
                    cb(...args);
                    // Re-schedule interval
                    const timer = timers.find(t => t.id === id);
                    if (timer) {
                        timer.scheduledTime = currentTime + delay;
                    }
                };
                timers.push({
                    callback: intervalCallback,
                    delay,
                    id,
                    scheduledTime: currentTime + delay
                });
                return id;
            }) as any;

            globalThis.clearInterval = mock((id: number) => {
                const idx = timers.findIndex(t => t.id === id);
                if (idx !== -1) timers.splice(idx, 1);
            }) as any;
        },

        /**
         * Advance time by specified milliseconds, running any timers that become due
         */
        advanceTimersByTime(ms: number) {
            const targetTime = currentTime + ms;

            while (currentTime < targetTime) {
                // Find next timer that should fire
                const dueTimers = timers
                    .filter(t => t.scheduledTime <= targetTime)
                    .sort((a, b) => a.scheduledTime - b.scheduledTime);

                if (dueTimers.length === 0) {
                    currentTime = targetTime;
                    break;
                }

                const nextTimer = dueTimers[0];
                currentTime = nextTimer.scheduledTime;

                // Remove timer before executing (unless it's an interval)
                const idx = timers.findIndex(t => t.id === nextTimer.id);
                if (idx !== -1) {
                    // For intervals, we don't remove, just reschedule (done in callback)
                    // For timeouts, we remove
                    timers.splice(idx, 1);
                }

                nextTimer.callback();
            }

            currentTime = targetTime;
        },

        /**
         * Run all pending timers immediately
         */
        runAllTimers() {
            const maxIterations = 1000; // Prevent infinite loops
            let iterations = 0;

            while (timers.length > 0 && iterations < maxIterations) {
                iterations++;
                const pending = [...timers].sort((a, b) => a.scheduledTime - b.scheduledTime);

                for (const timer of pending) {
                    const idx = timers.findIndex(t => t.id === timer.id);
                    if (idx !== -1) {
                        timers.splice(idx, 1);
                        currentTime = timer.scheduledTime;
                        timer.callback();
                    }
                }
            }
        },

        /**
         * Run only the pending timers (not recurring)
         */
        runOnlyPendingTimers() {
            const pending = [...timers].sort((a, b) => a.scheduledTime - b.scheduledTime);

            for (const timer of pending) {
                const idx = timers.findIndex(t => t.id === timer.id);
                if (idx !== -1) {
                    timers.splice(idx, 1);
                    currentTime = timer.scheduledTime;
                    timer.callback();
                }
            }
        },

        /**
         * Get number of pending timers
         */
        getTimerCount() {
            return timers.length;
        },

        /**
         * Restore original timer functions
         */
        restore() {
            if (!installed) return;
            installed = false;

            globalThis.setTimeout = originalSetTimeout;
            globalThis.clearTimeout = originalClearTimeout;
            globalThis.setInterval = originalSetInterval;
            globalThis.clearInterval = originalClearInterval;

            // Restore window timers if they exist
            if (typeof window !== 'undefined') {
                if (originalWindowSetTimeout) (window as any).setTimeout = originalWindowSetTimeout;
                if (originalWindowClearTimeout) (window as any).clearTimeout = originalWindowClearTimeout;
            }

            timers.length = 0;
            currentTime = 0;
            nextId = 1;
        },

        /**
         * Reset timers without restoring original functions
         */
        reset() {
            timers.length = 0;
            currentTime = 0;
        }
    };
}

// Export a singleton instance for convenience
export const timerMock = createTimerMock();
