export interface RetryConfig {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    exponentialBackoff: boolean;
    jitter: boolean;
    retryCondition?: (error: Error, attempt: number) => boolean;
}

export interface RetryResult<T> {
    success: boolean;
    result?: T;
    error?: Error;
    attempts: number;
    totalTime: number;
    lastAttemptTime: number;
}

export interface RetryOptions {
    operationName?: string;
    timeout?: number;
    maxAttempts?: number;
    onRetry?: (attempt: number, error: Error, nextDelay: number) => void;
    onSuccess?: (result: any, attempts: number) => void;
    onFinalFailure?: (error: Error, attempts: number) => void;
}

export class RetryManager {
    private static readonly DEFAULT_CONFIG: RetryConfig = {
        maxAttempts: 3,
        baseDelay: 1000, // 1 second
        maxDelay: 10000, // 10 seconds
        exponentialBackoff: true,
        jitter: true,
        retryCondition: (error: Error) => {
            // Retry on transient errors
            return error.name === 'QuotaExceededError' ||
                   error.name === 'DataCloneError' ||
                   error.message.includes('localStorage') ||
                   error.message.includes('transaction') ||
                   error.message.includes('network') ||
                   error.message.includes('timeout');
        }
    };

    constructor(private config: RetryConfig = RetryManager.DEFAULT_CONFIG) {
        this.config = { ...RetryManager.DEFAULT_CONFIG, ...config };
    }

    async executeWithRetry<T>(
        operation: () => Promise<T> | T,
        options: RetryOptions = {}
    ): Promise<RetryResult<T>> {
        const startTime = Date.now();
        let lastError: Error | undefined;
        let attempt = 0;

        const operationName = options.operationName || 'anonymous operation';

        while (attempt < this.config.maxAttempts) {
            attempt++;
            const attemptStartTime = Date.now();

            try {
                // Apply timeout if specified
                const result = options.timeout 
                    ? await this.withTimeout(operation, options.timeout)
                    : await Promise.resolve(operation());

                const totalTime = Date.now() - startTime;
                
                if (options.onSuccess) {
                    try {
                        options.onSuccess(result, attempt);
                    } catch (callbackError) {
                        console.warn('Error in onSuccess callback:', callbackError);
                    }
                }


                return {
                    success: true,
                    result,
                    attempts: attempt,
                    totalTime,
                    lastAttemptTime: Date.now() - attemptStartTime
                };

            } catch (error) {
                const errorObj = error instanceof Error ? error : new Error(String(error));
                lastError = errorObj;

                console.warn(`❌ ${operationName} failed on attempt ${attempt}/${this.config.maxAttempts}:`, errorObj.message);

                // Check if we should retry this error
                const shouldRetry = this.shouldRetry(errorObj, attempt);
                
                if (!shouldRetry || attempt >= this.config.maxAttempts) {
                    break;
                }

                // Calculate delay for next attempt
                const delay = this.calculateDelay(attempt);
                
                if (options.onRetry) {
                    try {
                        options.onRetry(attempt, errorObj, delay);
                    } catch (callbackError) {
                        console.warn('Error in onRetry callback:', callbackError);
                    }
                }

                console.log(`🔄 Retrying ${operationName} in ${delay}ms (attempt ${attempt + 1}/${this.config.maxAttempts})`);
                
                // Wait before next attempt
                await this.delay(delay);
            }
        }

        const totalTime = Date.now() - startTime;
        
        if (options.onFinalFailure && lastError) {
            try {
                options.onFinalFailure(lastError, attempt);
            } catch (callbackError) {
                console.warn('Error in onFinalFailure callback:', callbackError);
            }
        }

        console.error(`💥 ${operationName} failed after ${attempt} attempts over ${totalTime}ms`);

        return {
            success: false,
            error: lastError,
            attempts: attempt,
            totalTime,
            lastAttemptTime: 0
        };
    }

    // Specialized retry methods for common patterns
    async retryStorageOperation<T>(
        operation: () => T,
        options: RetryOptions = {}
    ): Promise<RetryResult<T>> {
        const storageConfig: RetryConfig = {
            ...this.config,
            maxAttempts: 3,
            baseDelay: 500,
            retryCondition: (error: Error) => {
                return error.name === 'QuotaExceededError' ||
                       error.name === 'SecurityError' ||
                       error.message.includes('localStorage') ||
                       error.message.includes('storage');
            }
        };

        const tempManager = new RetryManager(storageConfig);
        return tempManager.executeWithRetry(operation, {
            operationName: 'storage operation',
            ...options
        });
    }

    async retryNetworkOperation<T>(
        operation: () => Promise<T>,
        options: RetryOptions = {}
    ): Promise<RetryResult<T>> {
        const networkConfig: RetryConfig = {
            ...this.config,
            maxAttempts: 5,
            baseDelay: 1000,
            maxDelay: 30000,
            retryCondition: (error: Error) => {
                return error.name === 'NetworkError' ||
                       error.name === 'TimeoutError' ||
                       error.message.includes('fetch') ||
                       error.message.includes('network') ||
                       error.message.includes('timeout');
            }
        };

        const tempManager = new RetryManager(networkConfig);
        return tempManager.executeWithRetry(operation, {
            operationName: 'network operation',
            timeout: 30000, // 30 second timeout
            ...options
        });
    }

    async retryTransactionOperation<T>(
        operation: () => T,
        options: RetryOptions = {}
    ): Promise<RetryResult<T>> {
        const transactionConfig: RetryConfig = {
            ...this.config,
            maxAttempts: 2, // Transactions should be quick to retry
            baseDelay: 100,
            maxDelay: 1000,
            exponentialBackoff: false,
            retryCondition: (error: Error) => {
                return error.message.includes('transaction') ||
                       error.message.includes('conflict') ||
                       error.message.includes('integrity');
            }
        };

        const tempManager = new RetryManager(transactionConfig);
        return tempManager.executeWithRetry(operation, {
            operationName: 'transaction operation',
            ...options
        });
    }

    // Circuit breaker pattern for frequently failing operations
    createCircuitBreaker<T>(
        operation: () => Promise<T> | T,
        options: {
            failureThreshold: number;
            recoveryTimeout: number;
            operationName?: string;
        }
    ): () => Promise<RetryResult<T>> {
        let failureCount = 0;
        let lastFailureTime = 0;
        let isCircuitOpen = false;

        const { failureThreshold, recoveryTimeout, operationName = 'circuit breaker operation' } = options;

        return async (): Promise<RetryResult<T>> => {
            const now = Date.now();

            // Check if circuit should be closed (recovered)
            if (isCircuitOpen && (now - lastFailureTime) > recoveryTimeout) {
                console.log(`🔄 Circuit breaker for ${operationName} attempting recovery`);
                isCircuitOpen = false;
                failureCount = 0;
            }

            // If circuit is open, fail fast
            if (isCircuitOpen) {
                console.warn(`⚡ Circuit breaker for ${operationName} is OPEN - failing fast`);
                return {
                    success: false,
                    error: new Error(`Circuit breaker is open for ${operationName}`),
                    attempts: 0,
                    totalTime: 0,
                    lastAttemptTime: 0
                };
            }

            // Execute the operation with retry
            const result = await this.executeWithRetry(operation, {
                operationName,
                onFinalFailure: () => {
                    failureCount++;
                    lastFailureTime = now;
                    
                    if (failureCount >= failureThreshold) {
                        isCircuitOpen = true;
                        console.warn(`⚡ Circuit breaker for ${operationName} is now OPEN after ${failureCount} failures`);
                    }
                },
                onSuccess: () => {
                    // Reset failure count on success
                    if (failureCount > 0) {
                        console.log(`✅ Circuit breaker for ${operationName} reset after successful operation`);
                        failureCount = 0;
                    }
                }
            });

            return result;
        };
    }

    // Utility methods for batch operations with retry
    async retryBatch<T, R>(
        items: T[],
        operation: (item: T, index: number) => Promise<R> | R,
        options: {
            maxConcurrency?: number;
            stopOnFirstFailure?: boolean;
            operationName?: string;
        } & RetryOptions = {}
    ): Promise<{ results: (R | Error)[], totalAttempts: number, successCount: number }> {
        const { maxConcurrency = 5, stopOnFirstFailure = false } = options;
        const results: (R | Error)[] = [];
        let totalAttempts = 0;
        let successCount = 0;

        // Process in chunks if max concurrency is set
        for (let i = 0; i < items.length; i += maxConcurrency) {
            const chunk = items.slice(i, i + maxConcurrency);
            
            const chunkPromises = chunk.map(async (item, chunkIndex) => {
                const index = i + chunkIndex;
                const result = await this.executeWithRetry(
                    () => operation(item, index),
                    {
                        ...options,
                        operationName: `${options.operationName || 'batch operation'} [${index}]`
                    }
                );

                totalAttempts += result.attempts;

                if (result.success && result.result !== undefined) {
                    successCount++;
                    return result.result;
                } else {
                    const error = result.error || new Error('Unknown error');
                    if (stopOnFirstFailure) {
                        throw error;
                    }
                    return error;
                }
            });

            try {
                const chunkResults = await Promise.all(chunkPromises);
                results.push(...chunkResults);
            } catch (error) {
                if (stopOnFirstFailure) {
                    results.push(error as Error);
                    break;
                }
            }
        }

        return { results, totalAttempts, successCount };
    }

    // Health check with retry
    async healthCheck(
        checks: Array<{ name: string; check: () => Promise<boolean> | boolean }>,
        options: RetryOptions = {}
    ): Promise<{ healthy: boolean; results: Array<{ name: string; healthy: boolean; error?: Error }> }> {
        const results: Array<{ name: string; healthy: boolean; error?: Error }> = [];
        let overallHealthy = true;

        for (const { name, check } of checks) {
            const result = await this.executeWithRetry(
                async () => {
                    const isHealthy = await Promise.resolve(check());
                    if (!isHealthy) {
                        throw new Error(`Health check failed: ${name}`);
                    }
                    return true;
                },
                {
                    ...options,
                    operationName: `health check: ${name}`,
                    maxAttempts: 2 // Quick health checks
                }
            );

            if (result.success) {
                results.push({ name, healthy: true });
            } else {
                results.push({ name, healthy: false, error: result.error });
                overallHealthy = false;
            }
        }

        return { healthy: overallHealthy, results };
    }

    // Private helper methods
    private shouldRetry(error: Error, attempt: number): boolean {
        if (this.config.retryCondition) {
            return this.config.retryCondition(error, attempt);
        }
        return true; // Default to retry
    }

    private calculateDelay(attempt: number): number {
        let delay = this.config.baseDelay;

        if (this.config.exponentialBackoff) {
            delay = Math.min(
                this.config.baseDelay * Math.pow(2, attempt - 1),
                this.config.maxDelay
            );
        }

        if (this.config.jitter) {
            // Add random jitter (±25%)
            const jitterAmount = delay * 0.25;
            delay += (Math.random() - 0.5) * jitterAmount * 2;
        }

        return Math.max(0, Math.floor(delay));
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async withTimeout<T>(operation: () => Promise<T> | T, timeoutMs: number): Promise<T> {
        return new Promise<T>(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Operation timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            try {
                const result = await Promise.resolve(operation());
                clearTimeout(timeoutId);
                resolve(result);
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }

    // Configuration management
    updateConfig(updates: Partial<RetryConfig>): void {
        this.config = { ...this.config, ...updates };
    }

    getConfig(): Readonly<RetryConfig> {
        return { ...this.config };
    }

    // Static utility methods
    static async withRetry<T>(
        operation: () => Promise<T> | T,
        config?: Partial<RetryConfig>,
        options?: RetryOptions
    ): Promise<RetryResult<T>> {
        const manager = new RetryManager(config ? { ...RetryManager.DEFAULT_CONFIG, ...config } : RetryManager.DEFAULT_CONFIG);
        return manager.executeWithRetry(operation, options);
    }

    static createStorageRetryManager(): RetryManager {
        return new RetryManager({
            maxAttempts: 3,
            baseDelay: 500,
            maxDelay: 5000,
            exponentialBackoff: true,
            jitter: true,
            retryCondition: (error: Error) => {
                return error.name === 'QuotaExceededError' ||
                       error.name === 'SecurityError' ||
                       error.message.includes('localStorage');
            }
        });
    }

    static createNetworkRetryManager(): RetryManager {
        return new RetryManager({
            maxAttempts: 5,
            baseDelay: 1000,
            maxDelay: 30000,
            exponentialBackoff: true,
            jitter: true,
            retryCondition: (error: Error) => {
                return error.name === 'NetworkError' ||
                       error.name === 'TimeoutError' ||
                       error.message.includes('fetch');
            }
        });
    }
}