import { beforeEach, afterEach, mock } from 'bun:test'

// Setup DOM environment
beforeEach(() => {
  // Clear DOM
  document.body.innerHTML = ''

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

  // Mock IndexedDB storage
  const indexedDBStorage = new Map<any, any>()

  const mockIDBRequest = (result?: any): IDBRequest => {
    const request: any = {
      result,
      error: null,
      source: null,
      transaction: null,
      readyState: 'done',
      onsuccess: null,
      onerror: null,
      addEventListener: mock((event: string, handler: any) => {
        if (event === 'success') request.onsuccess = handler;
        if (event === 'error') request.onerror = handler;
      }),
      removeEventListener: mock()
    };

    setTimeout(() => {
      if (request.onsuccess) {
        request.onsuccess({ target: request });
      }
    }, 0);

    return request as IDBRequest;
  };

  const mockObjectStore: any = {
    add: mock((value: any, key?: any) => {
      const storeKey = key || value.id;
      indexedDBStorage.set(storeKey, value);
      return mockIDBRequest(storeKey);
    }),
    put: mock((value: any, key?: any) => {
      const storeKey = key || value.id;
      indexedDBStorage.set(storeKey, value);
      return mockIDBRequest(storeKey);
    }),
    get: mock((key: any) => {
      const value = indexedDBStorage.get(key);
      return mockIDBRequest(value);
    }),
    delete: mock((key: any) => {
      indexedDBStorage.delete(key);
      return mockIDBRequest(undefined);
    }),
    clear: mock(() => {
      indexedDBStorage.clear();
      return mockIDBRequest(undefined);
    }),
    getAll: mock(() => {
      const values = Array.from(indexedDBStorage.values());
      return mockIDBRequest(values);
    }),
    getAllKeys: mock(() => {
      const keys = Array.from(indexedDBStorage.keys());
      return mockIDBRequest(keys);
    })
  };

  const mockTransaction: any = {
    objectStore: mock(() => mockObjectStore),
    oncomplete: null,
    onerror: null,
    onabort: null,
    addEventListener: mock(),
    removeEventListener: mock()
  };

  const mockDB: any = {
    transaction: mock(() => mockTransaction),
    close: mock(),
    createObjectStore: mock(() => mockObjectStore),
    deleteObjectStore: mock(),
    objectStoreNames: { contains: mock(() => true) }
  };

  const mockOpenDBRequest: any = mockIDBRequest(mockDB);
  mockOpenDBRequest.onupgradeneeded = null;

  const mockIndexedDB = {
    open: mock(() => {
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
    deleteDatabase: mock(() => mockIDBRequest(undefined)),
    databases: mock(async () => []),
    cmp: mock((a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0))
  };

  Object.defineProperty(window, 'indexedDB', {
    value: mockIndexedDB,
    writable: true,
    configurable: true
  });

  // Mock fetch
  global.fetch = mock() as any
})

// Clean up after each test (Bun automatically restores mocks)
afterEach(() => {
  // Bun test automatically restores mocks between tests
})
