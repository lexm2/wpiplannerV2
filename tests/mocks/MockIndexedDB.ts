import { mock } from 'bun:test';
import LZString from 'lz-string';

/**
 * Configuration for MockIndexedDB behavior
 */
export interface MockIndexedDBConfig {
    /** Simulate operation delays (ms) */
    operationDelay?: number;
    /** Simulate quota exceeded error */
    quotaExceeded?: boolean;
    /** Simulate transaction failure */
    transactionFails?: boolean;
    /** Simulate compression like real IndexedDBStorageManager */
    useCompression?: boolean;
    /** Maximum storage size (for quota testing) */
    maxStorageSize?: number;
}

/**
 * Enhanced MockIndexedDB that simulates realistic IndexedDB behavior
 *
 * Features:
 * - Realistic async behavior with configurable delays
 * - LZString compression/decompression (matching IndexedDBStorageManager)
 * - Error simulation (quota exceeded, transaction failures)
 * - Operation tracking for test assertions
 * - Helper methods to inspect stored data
 *
 * Usage:
 * ```typescript
 * const mockDB = new MockIndexedDB({ useCompression: true });
 * const db = await mockDB.open('wpi-planner', 1);
 * const store = db.transaction('schedules', 'readwrite').objectStore('schedules');
 * await store.put({ id: 'schedule-1', data: {...} });
 * ```
 */
export class MockIndexedDB {
    private databasesMap = new Map<string, Map<string, Map<string, any>>>();
    private config: Required<MockIndexedDBConfig>;
    private currentStorageSize = 0;

    // Operation tracking for assertions
    public operations = {
        open: 0,
        get: 0,
        put: 0,
        delete: 0,
        clear: 0,
        getAll: 0,
    };

    constructor(config: MockIndexedDBConfig = {}) {
        this.config = {
            operationDelay: config.operationDelay ?? 0,
            quotaExceeded: config.quotaExceeded ?? false,
            transactionFails: config.transactionFails ?? false,
            useCompression: config.useCompression ?? true,
            maxStorageSize: config.maxStorageSize ?? 50 * 1024 * 1024, // 50MB default
        };
    }

    /**
     * Create a mock IDB request with realistic async behavior
     */
    private createRequest<T>(result: T, error: Error | null = null): IDBRequest<T> {
        const request: any = {
            result: error ? undefined : result,
            error,
            source: null,
            transaction: null,
            readyState: 'pending' as IDBRequestReadyState,
            onsuccess: null,
            onerror: null,
            addEventListener: mock((event: string, handler: any) => {
                if (event === 'success') request.onsuccess = handler;
                if (event === 'error') request.onerror = handler;
            }),
            removeEventListener: mock(),
        };

        // Callback to fire when request completes
        const fireCallback = () => {
            request.readyState = 'done';
            if (error) {
                if (request.onerror) {
                    request.onerror({ target: request });
                }
            } else {
                if (request.onsuccess) {
                    request.onsuccess({ target: request });
                }
            }
        };

        // Use queueMicrotask for zero delay to ensure callbacks are assigned first
        // This fixes race conditions where setTimeout(0) fires before callback assignment
        if (this.config.operationDelay === 0) {
            queueMicrotask(fireCallback);
        } else {
            setTimeout(fireCallback, this.config.operationDelay);
        }

        return request as IDBRequest<T>;
    }

    /**
     * Get or create database storage
     */
    private getDatabase(dbName: string): Map<string, Map<string, any>> {
        if (!this.databasesMap.has(dbName)) {
            this.databasesMap.set(dbName, new Map());
        }
        return this.databasesMap.get(dbName)!;
    }

    /**
     * Get or create object store
     */
    private getStore(dbName: string, storeName: string): Map<string, any> {
        const db = this.getDatabase(dbName);
        if (!db.has(storeName)) {
            db.set(storeName, new Map());
        }
        return db.get(storeName)!;
    }

    /**
     * Compress data using LZString (like IndexedDBStorageManager)
     */
    private compress(data: any): string {
        if (!this.config.useCompression) {
            return JSON.stringify(data);
        }
        const json = JSON.stringify(data);
        return LZString.compress(json);
    }

    /**
     * Decompress data using LZString
     */
    private decompress(compressed: string): any {
        if (!this.config.useCompression) {
            return JSON.parse(compressed);
        }
        const decompressed = LZString.decompress(compressed);
        return decompressed ? JSON.parse(decompressed) : null;
    }

    /**
     * Check if operation would exceed quota
     */
    private wouldExceedQuota(data: any): boolean {
        if (!this.config.quotaExceeded) {
            return false;
        }
        const dataSize = JSON.stringify(data).length;
        return this.currentStorageSize + dataSize > this.config.maxStorageSize;
    }

    /**
     * Create mock object store with realistic operations
     */
    private createObjectStore(dbName: string, storeName: string): IDBObjectStore {
        const store = this.getStore(dbName, storeName);

        const mockStore: any = {
            name: storeName,
            keyPath: 'id',
            autoIncrement: false,

            get: mock((key: string) => {
                this.operations.get++;
                if (this.config.transactionFails) {
                    return this.createRequest(
                        undefined,
                        new Error('Transaction failed')
                    );
                }

                const compressed = store.get(key);
                if (!compressed) {
                    return this.createRequest(undefined);
                }

                try {
                    const data = this.decompress(compressed);
                    return this.createRequest(data);
                } catch (error) {
                    return this.createRequest(undefined, error as Error);
                }
            }),

            put: mock((value: any, key?: string) => {
                this.operations.put++;
                const storeKey = key || value.id;

                if (this.config.transactionFails) {
                    return this.createRequest(
                        undefined,
                        new Error('Transaction failed')
                    );
                }

                if (this.wouldExceedQuota(value)) {
                    return this.createRequest(
                        undefined,
                        new DOMException('QuotaExceededError', 'QuotaExceededError')
                    );
                }

                try {
                    const compressed = this.compress(value);
                    const dataSize = JSON.stringify(value).length;
                    this.currentStorageSize += dataSize;
                    store.set(storeKey, compressed);
                    return this.createRequest(storeKey);
                } catch (error) {
                    return this.createRequest(undefined, error as Error);
                }
            }),

            delete: mock((key: string) => {
                this.operations.delete++;
                if (this.config.transactionFails) {
                    return this.createRequest(
                        undefined,
                        new Error('Transaction failed')
                    );
                }

                const compressed = store.get(key);
                if (compressed) {
                    try {
                        const data = this.decompress(compressed);
                        const dataSize = JSON.stringify(data).length;
                        this.currentStorageSize -= dataSize;
                    } catch {
                        // Ignore decompression errors on delete
                    }
                }

                store.delete(key);
                return this.createRequest(undefined);
            }),

            clear: mock(() => {
                this.operations.clear++;
                if (this.config.transactionFails) {
                    return this.createRequest(
                        undefined,
                        new Error('Transaction failed')
                    );
                }

                this.currentStorageSize = 0;
                store.clear();
                return this.createRequest(undefined);
            }),

            getAll: mock(() => {
                this.operations.getAll++;
                if (this.config.transactionFails) {
                    return this.createRequest(
                        [],
                        new Error('Transaction failed')
                    );
                }

                try {
                    const values = Array.from(store.values()).map((compressed) =>
                        this.decompress(compressed)
                    );
                    return this.createRequest(values);
                } catch (error) {
                    return this.createRequest([], error as Error);
                }
            }),

            getAllKeys: mock(() => {
                const keys = Array.from(store.keys());
                return this.createRequest(keys);
            }),

            count: mock(() => {
                return this.createRequest(store.size);
            }),
        };

        return mockStore as IDBObjectStore;
    }

    /**
     * Create mock transaction
     */
    private createTransaction(
        dbName: string,
        storeNames: string | string[],
        mode: IDBTransactionMode
    ): IDBTransaction {
        const stores = Array.isArray(storeNames) ? storeNames : [storeNames];

        const mockTransaction: any = {
            mode,
            objectStoreNames: stores,
            oncomplete: null,
            onerror: null,
            onabort: null,

            objectStore: mock((storeName: string) => {
                return this.createObjectStore(dbName, storeName);
            }),

            abort: mock(),
            addEventListener: mock(),
            removeEventListener: mock(),
        };

        // Auto-complete transaction after a delay
        // Use queueMicrotask for zero delay to ensure operations complete first
        const fireComplete = () => {
            if (mockTransaction.oncomplete) {
                mockTransaction.oncomplete({ target: mockTransaction });
            }
        };

        if (this.config.operationDelay === 0) {
            // Use nested queueMicrotask to run after request callbacks
            queueMicrotask(() => queueMicrotask(fireComplete));
        } else {
            setTimeout(fireComplete, this.config.operationDelay + 10);
        }

        return mockTransaction as IDBTransaction;
    }

    /**
     * Create mock database
     */
    private createDatabase(dbName: string): IDBDatabase {
        const storeNames = ['schedules', 'preferences', 'selectedCourses'];

        const mockDB: any = {
            name: dbName,
            version: 1,
            objectStoreNames: {
                length: storeNames.length,
                contains: (name: string) => storeNames.includes(name),
                item: (index: number) => storeNames[index] || null,
                [Symbol.iterator]: function* () {
                    for (const name of storeNames) {
                        yield name;
                    }
                }
            },

            transaction: mock((storeNames: string | string[], mode: IDBTransactionMode = 'readonly') => {
                return this.createTransaction(dbName, storeNames, mode);
            }),

            createObjectStore: mock((name: string) => {
                return this.createObjectStore(dbName, name);
            }),

            deleteObjectStore: mock(),
            close: mock(),
            addEventListener: mock(),
            removeEventListener: mock(),
        };

        return mockDB as IDBDatabase;
    }

    /**
     * Open database (main entry point)
     */
    open(name: string, version: number = 1): IDBOpenDBRequest {
        this.operations.open++;
        const db = this.createDatabase(name);

        const request: any = this.createRequest(db);
        request.onupgradeneeded = null;

        // Trigger upgrade if needed
        // Use queueMicrotask for zero delay to ensure callback is assigned first
        const fireUpgrade = () => {
            if (request.onupgradeneeded) {
                request.onupgradeneeded({ target: request, oldVersion: 0, newVersion: version });
            }
        };

        if (this.config.operationDelay === 0) {
            queueMicrotask(fireUpgrade);
        } else {
            setTimeout(fireUpgrade, this.config.operationDelay / 2);
        }

        return request as IDBOpenDBRequest;
    }

    /**
     * Delete database
     */
    deleteDatabase(name: string): IDBOpenDBRequest {
        this.databasesMap.delete(name);
        return this.createRequest(undefined) as unknown as IDBOpenDBRequest;
    }

    /**
     * List databases
     */
    async databases(): Promise<IDBDatabaseInfo[]> {
        return Array.from(this.databasesMap.keys()).map((name) => ({
            name,
            version: 1,
        }));
    }

    // =========================================================================
    // Test Helper Methods
    // =========================================================================

    /**
     * Get raw data from store (for test assertions)
     */
    getRawData(dbName: string, storeName: string, key: string): any {
        const store = this.getStore(dbName, storeName);
        const compressed = store.get(key);
        if (!compressed) return undefined;
        try {
            return this.decompress(compressed);
        } catch {
            return undefined;
        }
    }

    /**
     * Get all raw data from store
     */
    getAllRawData(dbName: string, storeName: string): any[] {
        const store = this.getStore(dbName, storeName);
        return Array.from(store.values()).map((compressed) => {
            try {
                return this.decompress(compressed);
            } catch {
                return null;
            }
        }).filter(Boolean);
    }

    /**
     * Check if key exists
     */
    hasKey(dbName: string, storeName: string, key: string): boolean {
        const store = this.getStore(dbName, storeName);
        return store.has(key);
    }

    /**
     * Get storage size
     */
    getStorageSize(): number {
        return this.currentStorageSize;
    }

    /**
     * Reset all data and operations
     */
    reset(): void {
        this.databasesMap.clear();
        this.currentStorageSize = 0;
        this.operations = {
            open: 0,
            get: 0,
            put: 0,
            delete: 0,
            clear: 0,
            getAll: 0,
        };
        this.config = {
            operationDelay: 0,
            quotaExceeded: false,
            transactionFails: false,
            useCompression: true,
            maxStorageSize: 50 * 1024 * 1024,
        };
    }

    /**
     * Update configuration
     */
    setConfig(config: Partial<MockIndexedDBConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

/**
 * Create a global MockIndexedDB instance for tests
 */
export function installMockIndexedDB(config?: MockIndexedDBConfig): MockIndexedDB {
    const mockDB = new MockIndexedDB(config);

    (global as any).indexedDB = {
        open: (name: string, version?: number) => mockDB.open(name, version),
        deleteDatabase: (name: string) => mockDB.deleteDatabase(name),
        databases: () => mockDB.databases(),
        cmp: (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0),
    };

    return mockDB;
}
