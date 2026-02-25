import { beforeEach, afterEach, mock } from 'bun:test'
import { MockIndexedDB } from './mocks/MockIndexedDB'
import { WorkerPoolManager } from '../src/workers/WorkerPoolManager'

await WorkerPoolManager.getInstance().initialize();

// Create global MockIndexedDB instance
const mockIndexedDBInstance = new MockIndexedDB();

// Expose MockIndexedDB globally for tests that need it
(global as any).__mockIndexedDB__ = mockIndexedDBInstance;

// Setup global indexedDB to use MockIndexedDB
const mockIndexedDBGlobal = {
  open: (name: string, version?: number) => mockIndexedDBInstance.open(name, version),
  deleteDatabase: (name: string) => mockIndexedDBInstance.deleteDatabase(name),
  databases: () => mockIndexedDBInstance.databases(),
  cmp: (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0),
};

// Set on both global and window (Happy-DOM creates separate window object)
(global as any).indexedDB = mockIndexedDBGlobal;
if (typeof window !== 'undefined') {
  (window as any).indexedDB = mockIndexedDBGlobal;
}

// Setup DOM environment
beforeEach(() => {
  // Clear DOM
  document.body.innerHTML = ''

  // Reset MockIndexedDB between tests
  mockIndexedDBInstance.reset();

  // Mock localStorage with functional storage
  const storage: Record<string, string> = {}
  const localStorageMock = {
    getItem: mock((key: string) => storage[key] || null),
    setItem: mock((key: string, value: string) => { storage[key] = value }),
    removeItem: mock((key: string) => { delete storage[key] }),
    clear: mock(() => { Object.keys(storage).forEach(key => delete storage[key]) }),
    get length() { return Object.keys(storage).length },
    key: mock((index: number) => Object.keys(storage)[index] || null)
  }

  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true
  })

  // Mock fetch
  global.fetch = mock() as any
})

// Clean up after each test (Bun automatically restores mocks)
afterEach(() => {
  // Bun test automatically restores mocks between tests
})
