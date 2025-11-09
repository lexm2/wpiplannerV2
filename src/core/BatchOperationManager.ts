import { UIStateBuffer, PendingOperation, SyncResult } from './UIStateBuffer'

export interface BatchOperation {
    id: string;
    operations: PendingOperation[];
    timestamp: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface BatchResult {
    success: boolean;
    batchId: string;
    operationsProcessed: number;
    operationsFailed: number;
    syncResult?: SyncResult;
    error?: string;
    duration: number;
}

export interface BatchOperationOptions {
    batchInterval: number; // ms between batch processing
    maxBatchSize: number; // maximum operations per batch
    maxRetries: number; // maximum retry attempts
    enableVisualFeedback: boolean; // show saving indicators
}

/**
 * Batches and processes operations from UIStateBuffer with visual feedback and error recovery
 */
export class BatchOperationManager {
    private uiStateBuffer: UIStateBuffer;
    private options: BatchOperationOptions;
    private batchTimer: NodeJS.Timeout | null = null;
    private activeBatches = new Map<string, BatchOperation>();
    private batchIdCounter = 0;
    private listeners = new Set<(result: BatchResult) => void>();
    private isProcessing = false;
    private visualFeedbackElements = new Set<HTMLElement>();

    constructor(uiStateBuffer: UIStateBuffer, options?: Partial<BatchOperationOptions>) {
        this.uiStateBuffer = uiStateBuffer;
        this.options = {
            batchInterval: 500, // 0.5 seconds for responsive feedback
            maxBatchSize: 10,
            maxRetries: 3,
            enableVisualFeedback: true,
            ...options
        };

        this.startBatchTimer();
        this.setupVisualFeedbackElements();
    }

    // Public API
    startBatchProcessing(): void {
        if (!this.batchTimer) {
            this.startBatchTimer();
        }
    }

    stopBatchProcessing(): void {
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
            this.batchTimer = null;
        }
    }

    async processBatchNow(): Promise<BatchResult> {
        return this.processBatch();
    }

    /**
     * Force immediate flush of all pending operations
     * This is critical for operations like deletion or navigation where
     * data must be persisted immediately before the action completes.
     */
    async flushPendingOperations(): Promise<BatchResult> {
        // If already processing, wait for it to complete
        if (this.isProcessing) {
            // Wait for current batch to finish
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (!this.isProcessing) {
                        clearInterval(checkInterval);
                        resolve(undefined);
                    }
                }, 50);
            });
        }

        // Process any remaining pending operations immediately
        if (this.hasPendingOperations()) {
            return await this.processBatch();
        }

        // No operations to flush
        return {
            success: true,
            batchId: 'no-op',
            operationsProcessed: 0,
            operationsFailed: 0,
            duration: 0
        };
    }

    hasPendingOperations(): boolean {
        return this.uiStateBuffer.hasPendingOperations();
    }

    getPendingOperationsCount(): number {
        return this.uiStateBuffer.getPendingOperationsCount();
    }

    isCurrentlyProcessing(): boolean {
        return this.isProcessing;
    }

    // Event handling
    addListener(listener: (result: BatchResult) => void): void {
        this.listeners.add(listener);
    }

    removeListener(listener: (result: BatchResult) => void): void {
        this.listeners.delete(listener);
    }

    // Visual feedback management
    addVisualFeedbackElement(element: HTMLElement): void {
        this.visualFeedbackElements.add(element);
    }

    removeVisualFeedbackElement(element: HTMLElement): void {
        this.visualFeedbackElements.delete(element);
    }

    // Configuration
    updateOptions(newOptions: Partial<BatchOperationOptions>): void {
        const oldInterval = this.options.batchInterval;
        this.options = { ...this.options, ...newOptions };
        
        // Restart timer if interval changed
        if (oldInterval !== this.options.batchInterval) {
            this.stopBatchProcessing();
            this.startBatchProcessing();
        }
    }

    // Debug methods
    debugState(): void {
        console.log('=== BATCH OPERATION MANAGER DEBUG ===');
        console.log('Is Processing:', this.isProcessing);
        console.log('Active Batches:', this.activeBatches.size);
        console.log('Pending Operations:', this.getPendingOperationsCount());
        console.log('Visual Feedback Elements:', this.visualFeedbackElements.size);
        console.log('Options:', this.options);
        console.log('Timer Active:', this.batchTimer !== null);
        
        if (this.activeBatches.size > 0) {
            console.log('Active Batch Details:');
            this.activeBatches.forEach((batch, id) => {
                console.log(`  ${id}: ${batch.operations.length} ops, status: ${batch.status}`);
            });
        }
        console.log('=====================================');
    }

    // Private implementation
    private startBatchTimer(): void {
        this.batchTimer = setInterval(async () => {
            if (this.hasPendingOperations() && !this.isProcessing) {
                await this.processBatch();
            }
        }, this.options.batchInterval);
    }

    private async processBatch(): Promise<BatchResult> {
        if (this.isProcessing) {
            return {
                success: false,
                batchId: 'duplicate',
                operationsProcessed: 0,
                operationsFailed: 0,
                error: 'Batch processing already in progress',
                duration: 0
            };
        }

        const startTime = Date.now();
        this.isProcessing = true;

        const batchId = this.generateBatchId();
        const batch: BatchOperation = {
            id: batchId,
            operations: [], // Will be populated by sync
            timestamp: Date.now(),
            status: 'processing'
        };

        this.activeBatches.set(batchId, batch);

        try {
            // Show visual feedback
            if (this.options.enableVisualFeedback) {
                this.showSavingIndicators();
            }

            // Execute backend synchronization
            const syncResult = await this.uiStateBuffer.syncWithBackend();
            
            batch.status = syncResult.success ? 'completed' : 'failed';
            
            const result: BatchResult = {
                success: syncResult.success,
                batchId,
                operationsProcessed: syncResult.operationsApplied,
                operationsFailed: syncResult.success ? 0 : 1,
                syncResult,
                error: syncResult.error,
                duration: Date.now() - startTime
            };

            // Show success/error feedback
            if (this.options.enableVisualFeedback) {
                if (syncResult.success) {
                    this.showSavedIndicators();
                    setTimeout(() => this.hideSavingIndicators(), 1500);
                } else {
                    this.showErrorIndicators();
                    setTimeout(() => this.hideSavingIndicators(), 3000);
                }
            }

            // Notify listeners
            this.notifyListeners(result);

            return result;

        } catch (error) {
            batch.status = 'failed';
            
            const result: BatchResult = {
                success: false,
                batchId,
                operationsProcessed: 0,
                operationsFailed: 1,
                error: error instanceof Error ? error.message : String(error),
                duration: Date.now() - startTime
            };

            if (this.options.enableVisualFeedback) {
                this.showErrorIndicators();
                setTimeout(() => this.hideSavingIndicators(), 3000);
            }

            this.notifyListeners(result);
            return result;

        } finally {
            this.isProcessing = false;
            this.activeBatches.delete(batchId);
        }
    }

    private generateBatchId(): string {
        return `batch_${Date.now()}_${++this.batchIdCounter}`;
    }

    private notifyListeners(result: BatchResult): void {
        this.listeners.forEach(listener => {
            try {
                listener(result);
            } catch (error) {
                console.error('Error in batch operation listener:', error);
            }
        });
    }

    private setupVisualFeedbackElements(): void {
        // Find common save-related elements and add them for feedback
        const saveButton = document.getElementById('save-profile-btn');
        if (saveButton) {
            this.addVisualFeedbackElement(saveButton);
        }

        // Add any other elements that should show saving feedback
        const statusElements = document.querySelectorAll('.save-status');
        statusElements.forEach(element => {
            this.addVisualFeedbackElement(element as HTMLElement);
        });
    }

    private showSavingIndicators(): void {
        this.visualFeedbackElements.forEach(element => {
            this.updateElementForSaving(element);
        });

        // Dispatch custom event for other components
        this.dispatchSaveStateEvent('saving');
    }

    private showSavedIndicators(): void {
        this.visualFeedbackElements.forEach(element => {
            this.updateElementForSaved(element);
        });

        this.dispatchSaveStateEvent('saved');
    }

    private showErrorIndicators(): void {
        this.visualFeedbackElements.forEach(element => {
            this.updateElementForError(element);
        });

        this.dispatchSaveStateEvent('error');
    }

    private hideSavingIndicators(): void {
        this.visualFeedbackElements.forEach(element => {
            this.resetElement(element);
        });

        this.dispatchSaveStateEvent('idle');
    }

    private updateElementForSaving(element: HTMLElement): void {
        element.classList.add('saving');
        element.classList.remove('saved', 'error');
        
        if (element.tagName === 'BUTTON') {
            const button = element as HTMLButtonElement;
            if (!button.dataset.originalText) {
                button.dataset.originalText = button.textContent || '';
            }
            button.textContent = 'Saving...';
            button.disabled = true;
        }
    }

    private updateElementForSaved(element: HTMLElement): void {
        element.classList.add('saved');
        element.classList.remove('saving', 'error');
        
        if (element.tagName === 'BUTTON') {
            const button = element as HTMLButtonElement;
            button.textContent = 'Saved!';
        }
    }

    private updateElementForError(element: HTMLElement): void {
        element.classList.add('error');
        element.classList.remove('saving', 'saved');
        
        if (element.tagName === 'BUTTON') {
            const button = element as HTMLButtonElement;
            button.textContent = 'Save Error';
        }
    }

    private resetElement(element: HTMLElement): void {
        element.classList.remove('saving', 'saved', 'error');
        
        if (element.tagName === 'BUTTON') {
            const button = element as HTMLButtonElement;
            if (button.dataset.originalText) {
                button.textContent = button.dataset.originalText;
                delete button.dataset.originalText;
            }
            button.disabled = false;
        }
    }

    private dispatchSaveStateEvent(state: 'saving' | 'saved' | 'error' | 'idle'): void {
        const event = new CustomEvent('batchOperationStateChange', {
            detail: {
                state,
                pendingOperations: this.getPendingOperationsCount(),
                isProcessing: this.isProcessing
            }
        });
        document.dispatchEvent(event);
    }

    // Cleanup
    destroy(): void {
        this.stopBatchProcessing();
        this.listeners.clear();
        this.visualFeedbackElements.clear();
        this.activeBatches.clear();
    }
}