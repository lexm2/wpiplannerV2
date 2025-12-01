import { beforeEach, afterEach, vi } from 'vitest'
import { installMockIndexedDB } from './mocks/MockIndexedDB'

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

  // Mock IndexedDB with enhanced mock that supports compression
  const mockDB = installMockIndexedDB({
    useCompression: true, // Match IndexedDBStorageManager behavior
    operationDelay: 0, // Fast for tests
  });

  // Store reference for test access
  (global as any).__mockIndexedDB__ = mockDB;

  Object.defineProperty(window, 'indexedDB', {
    value: global.indexedDB,
    writable: true,
    configurable: true
  });

  // Mock fetch
  global.fetch = vi.fn()

  // Mock Web Crypto API for checksum tests
  if (!global.crypto || !global.crypto.subtle) {
    const { webcrypto } = require('node:crypto')
    Object.defineProperty(global, 'crypto', {
      value: webcrypto,
      writable: true,
      configurable: true
    })
  }
})

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks()
})