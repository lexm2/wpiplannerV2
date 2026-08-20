import type { WorkerRequest, WorkerResponse, WorkerTaskType } from './protocol';
import LZString from 'lz-string';
import { logger } from '../utils/logger'

interface PendingTask {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

/**
 * Manages the storage web worker for off-thread compression/decompression.
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

  async initialize(): Promise<void> {
    if (typeof Worker === 'undefined') {
      logger.warn('[StorageWorker] Web Workers not supported, using fallback mode');
      this.fallbackMode = true;
      return;
    }

    try {
      this.worker = new Worker(
        new URL('./storage.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
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

      this.worker.onerror = (error: ErrorEvent) => {
        logger.error('[StorageWorker] Worker error:', error.message);
        this.fallbackMode = true;

        for (const [taskId, task] of this.pendingTasks.entries()) {
          task.reject(new Error(`Worker crashed: ${error.message}`));
          this.pendingTasks.delete(taskId);
        }
      };

    } catch (error) {
      logger.error('[StorageWorker] Failed to initialize:', error);
      this.fallbackMode = true;
    }
  }

  async executeTask<T>(type: WorkerTaskType, payload: unknown): Promise<T> {
    if (this.fallbackMode || !this.worker) {
      return this.executeFallback<T>(type, payload);
    }

    const taskId = `task-${++this.taskCounter}`;
    const request: WorkerRequest = {
      id: taskId,
      type,
      payload,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      this.pendingTasks.set(taskId, { resolve: resolve as (value: unknown) => void, reject });
      this.worker!.postMessage(request);

      setTimeout(() => {
        if (this.pendingTasks.has(taskId)) {
          this.pendingTasks.delete(taskId);
          reject(new Error(`Task ${taskId} timed out after 30s`));
        }
      }, 30000);
    });
  }

  private async executeFallback<T>(type: WorkerTaskType, payload: unknown): Promise<T> {
    const typedPayload = payload as { data?: unknown; compressed?: string };
    switch (type) {
      case 'compress_data': {
        const serialized = JSON.stringify(typedPayload.data);
        return LZString.compress(serialized) as T;
      }

      case 'decompress_data': {
        const decompressed = LZString.decompress(typedPayload.compressed!);
        return JSON.parse(decompressed || 'null') as T;
      }

      default:
        throw new Error(`Unknown task type: ${type}`);
    }
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pendingTasks.clear();
  }
}
