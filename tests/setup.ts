import { beforeEach, afterEach, vi } from 'vitest'

// Setup DOM environment
beforeEach(() => {
  // Clear DOM
  document.body.innerHTML = ''
  
  // Mock localStorage
  const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  }
  
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true
  })
  
  // Mock fetch
  global.fetch = vi.fn()
})

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks()
})