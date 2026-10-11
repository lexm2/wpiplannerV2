import type { WorkerRequest, WorkerResponse } from './protocol';
import { WorkerTaskType } from './protocol';
import LZString from 'lz-string';
import { logger } from '../utils/logger';
import { errorMessage } from '../utils/errorMessage';
import { setReplacer } from '../utils/jsonSerializer';

interface PendingTask {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

/**
 * Manages the storage web worker for off-thread compression.
 * Falls back to main-thread execution if workers are unavailable.
 */
export class StorageWorkerManager {
  private static instance: StorageWorkerManager | null = null;
  private worker: Worker | null = null;
  private pendingTasks: Map<string, PendingTask> = new Map();
  private fallbackMode = false;
  private taskCounter = 0;

  private constructor() {}

  static getInstance(): StorageWorkerManager {
    if (!StorageWorkerManager.instance) {
      StorageWorkerManager.instance = new StorageWorkerManager();
    }
    return StorageWorkerManager.instance;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- awaited on every storage operation
  async initialize(): Promise<void> {
    if (typeof Worker === 'undefined') {
      logger.warn(
        '[StorageWorker] Web Workers not supported, using fallback mode',
      );
      this.fallbackMode = true;
      return;
    }

    if (!this.worker) this.worker = this.createWorker();
  }

  private createWorker(): Worker | null {
    try {
      const worker = new Worker(
        new URL('./storage.worker.ts', import.meta.url),
        { type: 'module' },
      );

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const response = e.data;
        const pending = this.pendingTasks.get(response.id);
        if (!pending) return;

        this.pendingTasks.delete(response.id);

        if (response.success) {
          pending.resolve(response.data);
        } else {
          pending.reject(new Error(response.error || 'Worker task failed'));
        }
      };

      worker.onerror = (error: ErrorEvent) => {
        logger.error('[StorageWorker] Worker error:', error.message);
        this.fallbackMode = true;
        this.rejectAll(new Error(`Worker crashed: ${error.message}`));
      };
      return worker;
    } catch (error) {
      logger.error('[StorageWorker] Failed to initialize:', error);
      this.fallbackMode = true;
      return null;
    }
  }

  private rejectAll(reason: Error): void {
    for (const [taskId, task] of this.pendingTasks.entries()) {
      this.pendingTasks.delete(taskId);
      task.reject(reason);
    }
  }

  async executeTask<T>(type: WorkerTaskType, payload: unknown): Promise<T> {
    // terminate() runs on every beforeunload, but a bfcache restore brings the
    // page back without re-running startup: recreate the worker on demand.
    if (!this.fallbackMode && !this.worker && typeof Worker !== 'undefined') {
      this.worker = this.createWorker();
    }
    const worker = this.worker;
    if (this.fallbackMode || !worker) {
      return this.executeFallback<T>(type, payload);
    }

    const taskId = `task-${++this.taskCounter}`;
    const request: WorkerRequest = {
      id: taskId,
      type,
      payload,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingTasks.has(taskId)) {
          this.pendingTasks.delete(taskId);
          reject(new Error(`Task ${taskId} timed out after 30s`));
        }
      }, 30000);

      this.pendingTasks.set(taskId, {
        resolve: value => {
          clearTimeout(timeout);
          (resolve as (value: unknown) => void)(value);
        },
        reject: reason => {
          clearTimeout(timeout);
          reject(reason);
        },
      });

      // postMessage structured-clones the payload, so an unclonable value
      // (a Svelte deep-state Proxy, say) throws here - after the task was
      // registered. Unwind it rather than leaving a pending entry behind.
      try {
        worker.postMessage(request);
      } catch (error) {
        this.pendingTasks.delete(taskId);
        clearTimeout(timeout);
        reject(
          new Error(
            `Failed to post ${type} to the storage worker: ${errorMessage(error)}`,
          ),
        );
      }
    });
  }

  // Must produce exactly what storage.worker.ts does, since rows written in
  // one mode are read back in the other.
  // eslint-disable-next-line @typescript-eslint/require-await -- executeTask returns it directly as Promise<T>
  private async executeFallback<T>(
    type: WorkerTaskType,
    payload: unknown,
  ): Promise<T> {
    const typedPayload = payload as { data?: unknown };
    switch (type) {
      case WorkerTaskType.COMPRESS_DATA: {
        const serialized = JSON.stringify(typedPayload.data, setReplacer);
        return LZString.compress(serialized) as T;
      }

      default:
        throw new Error(`Unknown task type: ${type}`);
    }
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(new Error('Storage worker terminated'));
  }
}
