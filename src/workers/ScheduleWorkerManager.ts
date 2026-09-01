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
    try {
      this.worker = new Worker(
        new URL('./schedule.worker.ts', import.meta.url),
        { type: 'module' },
      );

      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
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

      this.worker.onerror = (error: ErrorEvent) => {
        logger.error('[ScheduleWorker] Worker error:', error.message);
        this.fallbackMode = true;
        for (const [taskId, task] of this.pendingTasks.entries()) {
          task.reject(new Error(`Worker crashed: ${error.message}`));
          this.pendingTasks.delete(taskId);
        }
      };
    } catch {
      this.fallbackMode = true;
    }
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
    if (this.fallbackMode || !this.worker) {
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
          this.pendingTasks.delete(taskId);
          reject(new Error(`Schedule generation timed out`));
        }
      }, 60_000);

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
        this.worker!.postMessage(request);
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
    const scorer = new ScheduleScorer();
    schedules.sort((a, b) => scorer.score(b) - scorer.score(a));
    return schedules;
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pendingTasks.clear();
  }
}
