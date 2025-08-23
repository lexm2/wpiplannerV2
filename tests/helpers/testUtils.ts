import { vi } from 'vitest'

export const mockFetch = (data: any, ok: boolean = true) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(data),
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Internal Server Error'
  })
}

export const mockLocalStorage = () => {
  const store: Record<string, string> = {}
  
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key])
    }),
    get store() { return { ...store } }
  }
}

export const createMockDOM = () => {
  document.body.innerHTML = `
    <div id="app">
      <div class="loading-message">Loading...</div>
    </div>
  `
}

export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const expectEventually = async (assertion: () => void, timeout: number = 1000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      assertion()
      return
    } catch {
      await waitFor(10)
    }
  }
  assertion() // Final attempt that will throw if still failing
}

// Helper to create Date objects for testing
export const createTestDate = (year: number, month: number, day: number) => {
  return new Date(year, month - 1, day) // month is 0-indexed
}

// Helper to assert array contents without order dependency
export const expectArrayToContain = <T>(actual: T[], expected: T[]) => {
  expected.forEach(item => {
    expect(actual).toContain(item)
  })
}

// Helper for time comparisons
export const expectTimeToEqual = (actual: { hours: number; minutes: number }, expected: { hours: number; minutes: number }) => {
  expect(actual.hours).toBe(expected.hours)
  expect(actual.minutes).toBe(expected.minutes)
}