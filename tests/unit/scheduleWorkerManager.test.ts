/**
 * ScheduleWorkerManager's timeout: a job that runs past the limit must not
 * keep the worker busy for the next request.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScheduleWorkerManager } from '../../src/workers/ScheduleWorkerManager';
import type { WorkerRequest } from '../../src/workers/protocol';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  posted: WorkerRequest[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(request: WorkerRequest): void {
    this.posted.push(request);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(data: unknown): void {
    const { id, type } = this.posted[this.posted.length - 1];
    this.onmessage?.({
      data: { id, type, success: true, data },
    } as MessageEvent);
  }
}

const input = { candidatesPerCourse: [], courses: [] };

function freshManager(): ScheduleWorkerManager {
  (ScheduleWorkerManager as unknown as { instance: unknown }).instance = null;
  return ScheduleWorkerManager.getInstance();
}

describe('ScheduleWorkerManager timeout', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('terminates the stuck worker and runs the retry on a fresh one', async () => {
    const manager = freshManager();

    const first = manager.generate(input, 10);
    const rejected = expect(first).rejects.toThrow(/timed out/);
    vi.advanceTimersByTime(60_000);
    await rejected;

    expect(FakeWorker.instances[0].terminated).toBe(true);

    const retry = manager.generate(input, 10);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[1].posted).toHaveLength(1);

    FakeWorker.instances[1].reply([]);
    await expect(retry).resolves.toEqual([]);
  });
});
