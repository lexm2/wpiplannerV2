import type { WorkerRequest, WorkerResponse, WorkerTaskType } from './protocol';
import LZString from 'lz-string';

export class WorkerPoolManager {
  private static instance: WorkerPoolManager | null = null;
  private workers: Map<string, Worker> = new Map();
  private pendingTasks: Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private fallbackMode = false;
  private taskCounter = 0;

  private constructor() {}

  static getInstance(): WorkerPoolManager {
    if (!WorkerPoolManager.instance) {
      WorkerPoolManager.instance = new WorkerPoolManager();
    }
    return WorkerPoolManager.instance;
  }

  async initialize(): Promise<void> {
    if (typeof Worker === 'undefined') {
      console.warn('[WorkerPool] Web Workers not supported, using fallback mode');
      this.fallbackMode = true;
      return;
    }

    try {
      const storageWorker = new Worker(
        new URL('./storage.worker.ts', import.meta.url),
        { type: 'module' }
      );

      storageWorker.onmessage = (e) => this.handleWorkerMessage('storage', e);
      storageWorker.onerror = (e) => this.handleWorkerError('storage', e);

      this.workers.set('storage', storageWorker);
      console.log('[WorkerPool] Storage worker initialized');

    } catch (error) {
      console.error('[WorkerPool] Failed to initialize workers:', error);
      this.fallbackMode = true;
    }
  }

  async executeTask<T>(type: WorkerTaskType, payload: any): Promise<T> {
    if (this.fallbackMode) {
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
      this.pendingTasks.set(taskId, { resolve, reject });

      const worker = this.workers.get('storage');
      if (!worker) {
        reject(new Error('Storage worker not available'));
        return;
      }

      worker.postMessage(request);

      setTimeout(() => {
        if (this.pendingTasks.has(taskId)) {
          this.pendingTasks.delete(taskId);
          reject(new Error(`Task ${taskId} timed out after 30s`));
        }
      }, 30000);
    });
  }

  private handleWorkerMessage(workerId: string, event: MessageEvent<WorkerResponse>): void {
    const response = event.data;
    const pending = this.pendingTasks.get(response.id);

    if (!pending) return;

    this.pendingTasks.delete(response.id);

    if (response.success) {
      pending.resolve(response.data);
    } else {
      pending.reject(new Error(response.error || 'Worker task failed'));
    }
  }

  private handleWorkerError(workerId: string, error: ErrorEvent): void {
    console.error(`[WorkerPool] Worker ${workerId} error:`, error.message);
    this.fallbackMode = true;

    for (const [taskId, task] of this.pendingTasks.entries()) {
      task.reject(new Error(`Worker crashed: ${error.message}`));
      this.pendingTasks.delete(taskId);
    }
  }

  private async executeFallback<T>(type: WorkerTaskType, payload: any): Promise<T> {
    switch (type) {
      case 'compress_data': {
        const serialized = JSON.stringify(payload.data);
        return LZString.compress(serialized) as T;
      }

      case 'decompress_data': {
        const decompressed = LZString.decompress(payload.compressed);
        return JSON.parse(decompressed || 'null') as T;
      }

      default:
        throw new Error(`No fallback for task type: ${type}`);
    }
  }

  terminate(): void {
    for (const worker of this.workers.values()) {
      worker.terminate();
    }
    this.workers.clear();
    this.pendingTasks.clear();
  }
}
