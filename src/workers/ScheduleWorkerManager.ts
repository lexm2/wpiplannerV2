import { WorkerTaskType } from './protocol';
import type { WorkerRequest, WorkerResponse } from './protocol';
import {
  SmartScheduler,
  type SchedulerInput,
} from '../services/scheduling/SmartScheduler';
import { ScheduleScorer } from '../services/scheduling/ScheduleScorer';
import type { ScheduleResult } from '../services/scheduling/AutoScheduler';
import { logger } from '../utils/logger';
import { errorMessage } from '../utils/errorMessage';

interface PendingTask {
  resolve: (value: ScheduleResult[][]) => void;
  reject: (reason: Error) => void;
}

const TIMEOUT_MS = 60_000;

export class ScheduleWorkerManager {
  private static instance: ScheduleWorkerManager | null = null;
  private worker: Worker | null = null;
  private pendingTasks: Map<string, PendingTask> = new Map();
  private fallbackMode = false;
  private taskCounter = 0;

  private constructor() {
    if (typeof Worker === 'undefined') {
      this.fallbackMode = true;
      return;
    }
    this.worker = this.createWorker();
  }

  private createWorker(): Worker | null {
    try {
      const worker = new Worker(
        new URL('./schedule.worker.ts', import.meta.url),
        { type: 'module' },
      );

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const { id, success, data, error } = e.data;
        const pending = this.pendingTasks.get(id);
        if (!pending) return;
        this.pendingTasks.delete(id);
        if (success) {
          pending.resolve(data as ScheduleResult[][]);
        } else {
          pending.reject(new Error(error || 'Worker task failed'));
        }
      };

      worker.onerror = (error: ErrorEvent) => {
        logger.error('[ScheduleWorker] Worker error:', error.message);
        this.fallbackMode = true;
        this.rejectAll(new Error(`Worker crashed: ${error.message}`));
      };
      return worker;
    } catch {
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

  /**
   * Stops a worker stuck on a long job. Without this the job keeps running,
   * and the next request queues behind it and times out in turn.
   */
  private restartWorker(reason: Error): void {
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(reason);
  }

  static getInstance(): ScheduleWorkerManager {
    if (!ScheduleWorkerManager.instance) {
      ScheduleWorkerManager.instance = new ScheduleWorkerManager();
    }
    return ScheduleWorkerManager.instance;
  }

  async generate(
    input: SchedulerInput,
    maxResults: number,
  ): Promise<ScheduleResult[][]> {
    if (!this.fallbackMode && !this.worker) this.worker = this.createWorker();
    const worker = this.worker;
    if (this.fallbackMode || !worker) {
      return this.executeFallback(input, maxResults);
    }

    const taskId = `sched-${++this.taskCounter}`;
    const request: WorkerRequest = {
      id: taskId,
      type: WorkerTaskType.GENERATE_SCHEDULES,
      payload: { input, maxResults },
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingTasks.has(taskId)) {
          this.restartWorker(
            new Error(
              `Schedule generation timed out after ${TIMEOUT_MS / 1000} seconds`,
            ),
          );
        }
      }, TIMEOUT_MS);

      this.pendingTasks.set(taskId, {
        resolve: value => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: reason => {
          clearTimeout(timeout);
          reject(reason);
        },
      });

      // postMessage structured-clones the payload; an unclonable value throws
      // here, after the task was registered. Unwind rather than leak it.
      try {
        worker.postMessage(request);
      } catch (error) {
        this.pendingTasks.delete(taskId);
        clearTimeout(timeout);
        reject(
          new Error(
            `Failed to post schedule generation to the worker: ${errorMessage(error)}`,
          ),
        );
      }
    });
  }

  private executeFallback(
    input: SchedulerInput,
    maxResults: number,
  ): ScheduleResult[][] {
    const schedules = SmartScheduler.findSchedules(input, maxResults);
    new ScheduleScorer().sortBest(schedules);
    return schedules;
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pendingTasks.clear();
  }
}
