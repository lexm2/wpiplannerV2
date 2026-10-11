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

class CancellationError extends Error {
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

  completeOperation(operationId: string): void {
    this.activeOperations.delete(operationId);
  }
}

export class DebouncedOperation {
  private timeoutId: number | null = null;
  private rejectPending: ((error: Error) => void) | null = null;
  private operationManager: OperationManager;
  private operationId: string;

  constructor(
    operationManager: OperationManager,
    operationId: string,
    private delay: number = 300,
  ) {
    this.operationManager = operationManager;
    this.operationId = operationId;
  }

  execute<T>(
    operation: (cancellationToken: CancellationToken) => Promise<T>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.clearPending('Superseded by a newer operation');
      this.rejectPending = reject;

      // The callback settles on every path; the void-wrapped IIFE keeps
      // setTimeout's void contract.
      this.timeoutId = window.setTimeout(() => {
        this.timeoutId = null;
        this.rejectPending = null;
        void (async () => {
          try {
            const token = this.operationManager.startOperation(
              this.operationId,
              'Debounced operation',
            );
            const result = await operation(token);
            this.operationManager.completeOperation(this.operationId);
            resolve(result);
          } catch (error) {
            // Reject on cancellation too. Returning here left the promise
            // permanently unsettled, leaking it and its closure on
            // every superseded keystroke, and made callers'
            // CancellationError branch unreachable. They filter by name.
            //
            // Keep Error identity: callers branch on error.name, so wrapping a
            // real Error would break the cancellation path.
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        })();
      }, this.delay);
    });
  }

  cancel(): void {
    this.clearPending('Debounced operation cancelled');
    this.operationManager.cancelOperation(
      this.operationId,
      'Debounced operation cancelled',
    );
  }

  // Drops a still-waiting call: clears its timer and rejects its promise with
  // CancellationError, which would otherwise never settle.
  private clearPending(reason: string): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    const reject = this.rejectPending;
    this.rejectPending = null;
    reject?.(new CancellationError(reason));
  }
}
