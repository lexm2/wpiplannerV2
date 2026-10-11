/**
 * StorageWorkerManager: the main-thread fallback must match storage.worker.ts
 * byte for byte, and a terminated worker must come back on the next task.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import LZString from 'lz-string';
import { StorageWorkerManager } from '../../src/workers/StorageWorkerManager';
import { WorkerTaskType } from '../../src/workers/protocol';
import type { WorkerRequest } from '../../src/workers/protocol';
import { setReplacer, setReviver } from '../../src/utils/jsonSerializer';

function freshManager(): StorageWorkerManager {
  (StorageWorkerManager as unknown as { instance: unknown }).instance = null;
  return StorageWorkerManager.getInstance();
}

afterEach(() => vi.unstubAllGlobals());

describe('StorageWorkerManager fallback', () => {
  // No Worker global, so these run on the fallback path.
  beforeEach(() => vi.stubGlobal('Worker', undefined));

  it('serializes Sets the way the worker does', async () => {
    const m = freshManager();
    await m.initialize();
    const data = { id: 'a', locked: new Set(['1', '2']) };
    const compressed = await m.executeTask<string>(
      WorkerTaskType.COMPRESS_DATA,
      { data },
    );
    expect(compressed).toBe(
      LZString.compress(JSON.stringify(data, setReplacer)),
    );
  });

  it('round-trips through the loader, Sets included', async () => {
    const m = freshManager();
    await m.initialize();
    const data = { id: 'a', locked: new Set(['1']) };
    const compressed = await m.executeTask<string>(
      WorkerTaskType.COMPRESS_DATA,
      { data },
    );
    // Decoded the way IndexedDBStorageManager.loadAllSchedules reads rows.
    const parsed = JSON.parse(
      LZString.decompress(compressed),
      setReviver,
    ) as typeof data;
    expect(parsed.locked).toEqual(new Set(['1']));
  });
});

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
    queueMicrotask(() =>
      this.onmessage?.({
        data: {
          id: request.id,
          type: request.type,
          success: true,
          data: 'ok',
        },
      } as MessageEvent),
    );
  }
  terminate(): void {
    this.terminated = true;
  }
}

describe('StorageWorkerManager after terminate', () => {
  it('recreates the worker instead of dropping to the fallback', async () => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    const m = freshManager();
    await m.initialize();
    m.terminate(); // what beforeunload does before a bfcache restore

    const result = await m.executeTask<string>(WorkerTaskType.COMPRESS_DATA, {
      data: {},
    });
    expect(result).toBe('ok');
    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[1].posted).toHaveLength(1);
  });
});
