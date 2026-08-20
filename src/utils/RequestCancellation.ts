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

export class OperationManager {
    private activeOperations = new Map<string, CancellationTokenSource>();

    // Cancels any existing operation with this id before starting a new one
    startOperation(operationId: string, reason?: string): CancellationToken {
        this.cancelOperation(operationId, reason);
        
        const tokenSource = new CancellationTokenSource();
        this.activeOperations.set(operationId, tokenSource);
        
        return tokenSource.token;
    }
    
    cancelOperation(operationId: string, reason?: string): void {
        const existingOperation = this.activeOperations.get(operationId);
        if (existingOperation) {
            existingOperation.cancel(reason || 'New operation started');
            this.activeOperations.delete(operationId);
        }
    }
    
    cancelAllOperations(reason?: string): void {
        for (const [_id, tokenSource] of this.activeOperations) {
            tokenSource.cancel(reason || 'All operations cancelled');
        }
        this.activeOperations.clear();
    }
    
    isOperationActive(operationId: string): boolean {
        return this.activeOperations.has(operationId);
    }

    getActiveOperationCount(): number {
        return this.activeOperations.size;
    }

    completeOperation(operationId: string): void {
        this.activeOperations.delete(operationId);
    }
}

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
            if (this.timeoutId !== null) {
                clearTimeout(this.timeoutId);
            }

            this.timeoutId = window.setTimeout(async () => {
                try {
                    const token = this.operationManager.startOperation(this.operationId, 'Debounced operation');
                    const result = await operation(token);
                    this.operationManager.completeOperation(this.operationId);
                    resolve(result);
                } catch (error) {
                    // Reject on cancellation too. Returning here left the promise
                    // permanently unsettled — leaking it and its closure on every
                    // superseded keystroke — and made callers' CancellationError
                    // branch unreachable. Callers filter by error.name.
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
