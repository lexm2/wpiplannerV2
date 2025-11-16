import { beforeEach, afterEach, vi } from 'vitest'

// Setup DOM environment
beforeEach(() => {
  // Clear DOM
  document.body.innerHTML = ''

  // Mock localStorage with functional storage
  const storage: Record<string, string> = {}
  const localStorageMock = {
    getItem: vi.fn((key: string) => storage[key] || null),
    setItem: vi.fn((key: string, value: string) => { storage[key] = value }),
    removeItem: vi.fn((key: string) => { delete storage[key] }),
    clear: vi.fn(() => { Object.keys(storage).forEach(key => delete storage[key]) }),
    get length() { return Object.keys(storage).length },
    key: vi.fn((index: number) => Object.keys(storage)[index] || null)
  }

  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true
  })

  // Mock IndexedDB
  const indexedDBStorage = new Map<string, any>();

  const mockIDBRequest = (result?: any): IDBRequest => {
    const request: any = {
      result,
      error: null,
      source: null,
      transaction: null,
      readyState: 'done',
      onsuccess: null,
      onerror: null,
      addEventListener: vi.fn((event: string, handler: any) => {
        if (event === 'success') request.onsuccess = handler;
        if (event === 'error') request.onerror = handler;
      }),
      removeEventListener: vi.fn()
    };

    setTimeout(() => {
      if (request.onsuccess) {
        request.onsuccess({ target: request });
      }
    }, 0);

    return request as IDBRequest;
  };

  const mockObjectStore: any = {
    add: vi.fn((value: any, key?: any) => {
      const storeKey = key || value.id;
      indexedDBStorage.set(storeKey, value);
      return mockIDBRequest(storeKey);
    }),
    put: vi.fn((value: any, key?: any) => {
      const storeKey = key || value.id;
      indexedDBStorage.set(storeKey, value);
      return mockIDBRequest(storeKey);
    }),
    get: vi.fn((key: any) => {
      const value = indexedDBStorage.get(key);
      return mockIDBRequest(value);
    }),
    delete: vi.fn((key: any) => {
      indexedDBStorage.delete(key);
      return mockIDBRequest(undefined);
    }),
    clear: vi.fn(() => {
      indexedDBStorage.clear();
      return mockIDBRequest(undefined);
    }),
    getAll: vi.fn(() => {
      const values = Array.from(indexedDBStorage.values());
      return mockIDBRequest(values);
    }),
    getAllKeys: vi.fn(() => {
      const keys = Array.from(indexedDBStorage.keys());
      return mockIDBRequest(keys);
    })
  };

  const mockTransaction: any = {
    objectStore: vi.fn(() => mockObjectStore),
    oncomplete: null,
    onerror: null,
    onabort: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };

  const mockDB: any = {
    transaction: vi.fn(() => mockTransaction),
    close: vi.fn(),
    createObjectStore: vi.fn(() => mockObjectStore),
    deleteObjectStore: vi.fn(),
    objectStoreNames: { contains: vi.fn(() => true) }
  };

  const mockOpenDBRequest: any = mockIDBRequest(mockDB);
  mockOpenDBRequest.onupgradeneeded = null;

  const mockIndexedDB = {
    open: vi.fn(() => {
      setTimeout(() => {
        if (mockOpenDBRequest.onupgradeneeded) {
          mockOpenDBRequest.onupgradeneeded({ target: mockOpenDBRequest });
        }
        if (mockOpenDBRequest.onsuccess) {
          mockOpenDBRequest.onsuccess({ target: mockOpenDBRequest });
        }
      }, 0);
      return mockOpenDBRequest;
    }),
    deleteDatabase: vi.fn(() => mockIDBRequest(undefined)),
    databases: vi.fn(async () => []),
    cmp: vi.fn((a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0))
  };

  Object.defineProperty(window, 'indexedDB', {
    value: mockIndexedDB,
    writable: true,
    configurable: true
  });

  global.indexedDB = mockIndexedDB as any;

  // Mock fetch
  global.fetch = vi.fn()
})

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks()
})