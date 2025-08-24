export class CancellationToken {
    private _cancelled: boolean = false;
    private _reason?: string;
    
    get isCancelled(): boolean {
        return this._cancelled;
    }
    
    get reason(): string | undefined {
        return this._reason;
    }
    
    cancel(reason?: string): void {
        this._cancelled = true;
        this._reason = reason;
    }
    
    throwIfCancelled(): void {
        if (this._cancelled) {
            throw new CancellationError(this._reason || 'Operation was cancelled');
        }
    }
}

export class CancellationError extends Error {
    constructor(message: string = 'Operation was cancelled') {
        super(message);
        this.name = 'CancellationError';
    }
}

export class CancellationTokenSource {
    private _token: CancellationToken;
    
    constructor() {
        this._token = new CancellationToken();
    }
    
    get token(): CancellationToken {
        return this._token;
    }
    
    cancel(reason?: string): void {
        this._token.cancel(reason);
    }
}

// Utility class for managing cancellable operations
export class OperationManager {
    private activeOperations = new Map<string, CancellationTokenSource>();
    
    // Cancel existing operation and create a new cancellation token
    startOperation(operationId: string, reason?: string): CancellationToken {
        this.cancelOperation(operationId, reason);
        
        const tokenSource = new CancellationTokenSource();
        this.activeOperations.set(operationId, tokenSource);
        
        return tokenSource.token;
    }
    
    // Cancel a specific operation
    cancelOperation(operationId: string, reason?: string): void {
        const existingOperation = this.activeOperations.get(operationId);
        if (existingOperation) {
            existingOperation.cancel(reason || 'New operation started');
            this.activeOperations.delete(operationId);
        }
    }
    
    // Cancel all active operations
    cancelAllOperations(reason?: string): void {
        for (const [id, tokenSource] of this.activeOperations) {
            tokenSource.cancel(reason || 'All operations cancelled');
        }
        this.activeOperations.clear();
    }
    
    // Check if an operation is active
    isOperationActive(operationId: string): boolean {
        return this.activeOperations.has(operationId);
    }
    
    // Get active operation count
    getActiveOperationCount(): number {
        return this.activeOperations.size;
    }
    
    // Complete an operation (remove from active list)
    completeOperation(operationId: string): void {
        this.activeOperations.delete(operationId);
    }
}

// Debounced operation helper
export class DebouncedOperation {
    private timeoutId: number | null = null;
    private operationManager: OperationManager;
    private operationId: string;
    
    constructor(operationManager: OperationManager, operationId: string, private delay: number = 300) {
        this.operationManager = operationManager;
        this.operationId = operationId;
    }
    
    execute<T>(operation: (cancellationToken: CancellationToken) => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            // Clear existing timeout
            if (this.timeoutId !== null) {
                clearTimeout(this.timeoutId);
            }
            
            // Set new timeout
            this.timeoutId = window.setTimeout(async () => {
                try {
                    const token = this.operationManager.startOperation(this.operationId, 'Debounced operation');
                    const result = await operation(token);
                    this.operationManager.completeOperation(this.operationId);
                    resolve(result);
                } catch (error) {
                    if (error instanceof CancellationError) {
                        // Don't reject on cancellation, just ignore
                        return;
                    }
                    reject(error);
                }
            }, this.delay);
        });
    }
    
    cancel(): void {
        if (this.timeoutId !== null) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        this.operationManager.cancelOperation(this.operationId, 'Debounced operation cancelled');
    }
    
    setDelay(delay: number): void {
        this.delay = Math.max(0, Math.min(5000, delay)); // Clamp between 0-5000ms
    }
}

// Utility functions for promise-based cancellation
export function createCancellablePromise<T>(
    executor: (resolve: (value: T) => void, reject: (reason?: any) => void, cancellationToken: CancellationToken) => void,
    cancellationToken: CancellationToken
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        if (cancellationToken.isCancelled) {
            reject(new CancellationError(cancellationToken.reason));
            return;
        }
        
        try {
            executor(resolve, reject, cancellationToken);
        } catch (error) {
            reject(error);
        }
    });
}

export function delay(ms: number, cancellationToken?: CancellationToken): Promise<void> {
    return createCancellablePromise<void>((resolve, reject, token) => {
        const timeoutId = setTimeout(() => {
            if (token.isCancelled) {
                reject(new CancellationError(token.reason));
            } else {
                resolve();
            }
        }, ms);
        
        // If cancelled before timeout, clear it
        if (token.isCancelled) {
            clearTimeout(timeoutId);
            reject(new CancellationError(token.reason));
        }
    }, cancellationToken || new CancellationToken());
}