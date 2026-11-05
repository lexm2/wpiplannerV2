/**
 * IndexedDBStorageManager against fake-indexeddb: rows round-trip through the
 * real compression path, a bad row is skipped rather than failing the load,
 * writes land in call order, and every past row format still decodes.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IndexedDBStorageManager } from '../../src/core/storage/IndexedDBStorageManager';
import { SCHEDULE_SCHEMA_VERSION } from '../../src/core/storage/scheduleMigration';
import { StorageWorkerManager } from '../../src/workers/StorageWorkerManager';
import { setReplacer } from '../../src/utils/jsonSerializer';
import type { Schedule } from '../../src/types/schedule';

const DB_NAME = 'wpi-planner-db';
const STORE = 'schedules';

function makeSchedule(id: string, locked: string[] = []): Schedule {
  return {
    id,
    name: `Schedule ${id}`,
    selectedCourses: [
      {
        course: { id: `course-${id}` },
        selected: {},
        isRequired: false,
        lockedSections: new Set(locked),
      },
    ],
    generatedSchedules: [],
  } as unknown as Schedule;
}

/** Writes a row straight into the store, bypassing saveSchedule. */
async function putRaw(row: Record<string, unknown>): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('open failed'));
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('aborted'));
  });
  db.close();
}

async function loadIds(manager: IndexedDBStorageManager): Promise<string[]> {
  const result = await manager.loadAllSchedules();
  expect(result.success).toBe(true);
  return (result.data ?? []).map(s => s.id).sort();
}

let manager: IndexedDBStorageManager;

beforeEach(async () => {
  // A fresh factory is a fresh, empty database for every test.
  vi.stubGlobal('indexedDB', new IDBFactory());
  // No Worker in jsdom: compression runs on the main-thread fallback.
  vi.stubGlobal('Worker', undefined);
  (StorageWorkerManager as unknown as { instance: unknown }).instance = null;
  await StorageWorkerManager.getInstance().initialize();
  manager = new IndexedDBStorageManager();
  await manager.initialize();
});

afterEach(() => vi.unstubAllGlobals());

describe('IndexedDBStorageManager round-trip', () => {
  it('loads back what it saved, Sets included', async () => {
    const saved = await manager.saveSchedule(makeSchedule('a', ['1', '2']));
    expect(saved.success).toBe(true);
    await manager.saveSchedule(makeSchedule('b'));

    const result = await manager.loadAllSchedules();
    expect(result.success).toBe(true);
    const byId = new Map(result.data!.map(s => [s.id, s]));
    expect([...byId.keys()].sort()).toEqual(['a', 'b']);

    const a = byId.get('a')!;
    expect(a.name).toBe('Schedule a');
    expect(typeof a.timestamp).toBe('number');
    expect(a.selectedCourses[0].lockedSections).toBeInstanceOf(Set);
    expect(a.selectedCourses[0].lockedSections).toEqual(new Set(['1', '2']));
  });

  it('overwrites a schedule saved twice under the same id', async () => {
    await manager.saveSchedule(makeSchedule('a'));
    await manager.saveSchedule({ ...makeSchedule('a'), name: 'Renamed' });
    const result = await manager.loadAllSchedules();
    expect(result.data!.map(s => s.name)).toEqual(['Renamed']);
  });
});

describe('IndexedDBStorageManager corrupt rows', () => {
  it('skips an undecodable row and still loads the rest', async () => {
    await manager.saveSchedule(makeSchedule('good'));
    await putRaw({
      id: 'bad',
      serializedData: 'definitely not lz-string output {',
      compressed: true,
      timestamp: 1,
      schemaVersion: SCHEDULE_SCHEMA_VERSION,
    });

    expect(await loadIds(manager)).toEqual(['good']);
  });

  it('skips a row whose payload decodes to a non-object', async () => {
    await manager.saveSchedule(makeSchedule('good'));
    await putRaw({ id: 'num', serializedData: '42', timestamp: 1 });

    expect(await loadIds(manager)).toEqual(['good']);
  });
});

describe('IndexedDBStorageManager write ordering', () => {
  it('a delete issued while a save is pending wins', async () => {
    const save = manager.saveSchedule(makeSchedule('x'));
    const del = manager.deleteSchedule('x');
    const [saved, deleted] = await Promise.all([save, del]);
    expect(saved.success).toBe(true);
    expect(deleted.success).toBe(true);

    expect(await loadIds(manager)).toEqual([]);
  });

  it('a clear issued while saves are pending wins', async () => {
    await manager.saveSchedule(makeSchedule('old'));
    const saves = [
      manager.saveSchedule(makeSchedule('x')),
      manager.saveSchedule(makeSchedule('y')),
    ];
    const clear = manager.clearAllSchedules();
    await Promise.all([...saves, clear]);

    expect(await loadIds(manager)).toEqual([]);
  });

  it('a save issued after a clear survives it', async () => {
    await manager.saveSchedule(makeSchedule('old'));
    const clear = manager.clearAllSchedules();
    const save = manager.saveSchedule(makeSchedule('new'));
    await Promise.all([clear, save]);

    expect(await loadIds(manager)).toEqual(['new']);
  });
});

describe('IndexedDBStorageManager legacy rows', () => {
  it('reads an uncompressed serializedData row', async () => {
    const schedule = makeSchedule('plain', ['9']);
    await putRaw({
      id: 'plain',
      serializedData: JSON.stringify(schedule, setReplacer),
      timestamp: 1,
      compressed: false,
      schemaVersion: SCHEDULE_SCHEMA_VERSION,
    });

    const [loaded] = (await manager.loadAllSchedules()).data!;
    expect(loaded.id).toBe('plain');
    expect(loaded.selectedCourses[0].lockedSections).toEqual(new Set(['9']));
  });

  it('reads and migrates a pre-serialization row stored as the object', async () => {
    // Older builds put the schedule itself in the store: no serializedData,
    // no compressed flag, no schemaVersion, and v2 selection fields.
    const lecture = { number: 'A01' };
    await putRaw({
      id: 'ancient',
      name: 'Ancient',
      timestamp: 1,
      generatedSchedules: [],
      selectedCourses: [
        {
          course: { id: 'c1', lectures: [lecture] },
          selectedLecture: lecture,
          selectedDiscussion: null,
          selectedLab: null,
          isRequired: false,
          lockedSections: new Set(),
        },
      ],
    });

    const [loaded] = (await manager.loadAllSchedules()).data!;
    expect(loaded.id).toBe('ancient');
    expect(loaded.name).toBe('Ancient');
    const sc = loaded.selectedCourses[0] as unknown as Record<string, unknown>;
    expect(sc.selected).toEqual({ lecture });
    expect(sc).not.toHaveProperty('selectedLecture');
  });

  it('migrates an unstamped serialized row', async () => {
    const lecture = { number: 'B02' };
    const v2 = {
      id: 'v2',
      name: 'V2',
      generatedSchedules: [],
      selectedCourses: [
        {
          course: { id: 'c1', lectures: [lecture] },
          selectedLecture: lecture,
          selectedDiscussion: null,
          selectedLab: null,
          isRequired: true,
          lockedSections: new Set(['x']),
        },
      ],
    };
    await putRaw({
      id: 'v2',
      serializedData: JSON.stringify(v2, setReplacer),
      timestamp: 1,
    });

    const [loaded] = (await manager.loadAllSchedules()).data!;
    expect(loaded.selectedCourses[0].selected).toEqual({ lecture });
    expect(loaded.selectedCourses[0].lockedSections).toEqual(new Set(['x']));
  });
});

/** A row as a build of this app wrote it, with the given decoded payload. */
function rowOf(
  id: string,
  payload: unknown,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    timestamp: Date.now(),
    compressed: false,
    schemaVersion: SCHEDULE_SCHEMA_VERSION,
    serializedData: JSON.stringify(payload, setReplacer),
    ...extra,
  };
}

describe('IndexedDBStorageManager load boundary', () => {
  const good = { name: 'ok', selectedCourses: [], generatedSchedules: [] };

  it('survives each malformed row, keeps the rest and counts the skips', async () => {
    await manager.saveSchedule(makeSchedule('keep'));
    await putRaw(rowOf('noid', good));
    await putRaw(rowOf('nullcourses', { ...good, selectedCourses: null }));
    await putRaw(
      rowOf('v99', { ...good, selectedCourses: [{}] }, { schemaVersion: 99 }),
    );
    await putRaw(
      rowOf('partial', {
        ...good,
        selectedCourses: [
          { selected: {} },
          { course: { id: 'x' } },
          { course: { id: 'fine' }, selected: {}, isRequired: false },
        ],
        localEvents: [null],
      }),
    );

    const result = await manager.loadAllSchedules();
    expect(result.success).toBe(true);
    const byId = new Map(result.data!.map(s => [s.id, s]));
    // A row without an id inside takes the store key.
    expect([...byId.keys()].sort()).toEqual(['keep', 'noid', 'partial']);
    expect(result.report).toEqual({
      unreadable: 1,
      newerVersion: 1,
      dropped: 2,
    });
    // The course that lost its picks keeps a usable shape.
    const partial = byId.get('partial')!;
    expect(partial.selectedCourses.map(c => c.course.id)).toEqual([
      'x',
      'fine',
    ]);
    expect(partial.localEvents).toEqual([]);
  });

  it('leaves skipped rows in the store', async () => {
    await putRaw(rowOf('v99', good, { schemaVersion: 99 }));
    await manager.loadAllSchedules();
    const second = await manager.loadAllSchedules();
    expect(second.report.newerVersion).toBe(1);
  });
});

describe('IndexedDBStorageManager concurrent tabs', () => {
  async function secondTab(): Promise<IndexedDBStorageManager> {
    const other = new IndexedDBStorageManager();
    await other.initialize();
    await other.loadAllSchedules();
    return other;
  }

  it('refuses to overwrite a row another tab changed', async () => {
    await manager.saveSchedule(makeSchedule('a'));
    await manager.loadAllSchedules();
    const other = await secondTab();

    expect((await other.saveSchedule(makeSchedule('a', ['9']))).success).toBe(
      true,
    );
    const stale = await manager.saveSchedule(makeSchedule('a', ['1']));
    expect(stale).toMatchObject({ success: false, conflict: 'newer' });

    // After re-reading, the write goes through.
    await manager.loadSchedule('a');
    expect((await manager.saveSchedule(makeSchedule('a', ['1']))).success).toBe(
      true,
    );
  });

  it('does not bring back a schedule another tab deleted', async () => {
    await manager.saveSchedule(makeSchedule('a'));
    await manager.loadAllSchedules();
    const other = await secondTab();
    await other.deleteSchedule('a');

    const stale = await manager.saveSchedule(makeSchedule('a'));
    expect(stale).toMatchObject({ success: false, conflict: 'deleted' });
    expect(await loadIds(manager)).toEqual([]);
  });

  it('does not undo a clear made in another tab', async () => {
    await manager.saveSchedule(makeSchedule('a'));
    await manager.loadAllSchedules();
    const other = await secondTab();
    await other.clearAllSchedules();

    const stale = await manager.saveSchedule(makeSchedule('a'));
    expect(stale.conflict).toBe('deleted');
    expect(await loadIds(manager)).toEqual([]);
  });

  it('writes a schedule this tab created without a baseline', async () => {
    const other = await secondTab();
    await other.saveSchedule(makeSchedule('mine'));
    expect(await loadIds(manager)).toEqual(['mine']);
  });
});
