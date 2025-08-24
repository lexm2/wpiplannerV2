export interface PerformanceMetric {
    operation: string;
    startTime: number;
    endTime: number;
    duration: number;
    metadata?: Record<string, any>;
}

export interface PerformanceReport {
    totalOperations: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    operations: PerformanceMetric[];
}

export interface FilterPerformanceMetrics {
    operation: 'filter' | 'search' | 'render' | 'batch-render';
    itemCount: number;
    duration: number;
    batchSize?: number;
    batchCount?: number;
    cancelled?: boolean;
}

export class PerformanceMetrics {
    private metrics: PerformanceMetric[] = [];
    private maxMetrics: number = 100; // Keep last 100 metrics
    private activeOperations = new Map<string, number>();

    // Start timing an operation
    startOperation(operation: string, metadata?: Record<string, any>): string {
        const operationId = `${operation}_${Date.now()}_${Math.random()}`;
        this.activeOperations.set(operationId, performance.now());
        return operationId;
    }

    // End timing an operation
    endOperation(operationId: string, metadata?: Record<string, any>): PerformanceMetric | null {
        const startTime = this.activeOperations.get(operationId);
        if (!startTime) {
            console.warn(`No start time found for operation: ${operationId}`);
            return null;
        }

        const endTime = performance.now();
        const duration = endTime - startTime;
        
        const metric: PerformanceMetric = {
            operation: operationId.split('_')[0],
            startTime,
            endTime,
            duration,
            metadata
        };

        this.addMetric(metric);
        this.activeOperations.delete(operationId);
        
        return metric;
    }

    // Track a completed operation
    trackOperation(operation: string, duration: number, metadata?: Record<string, any>): void {
        const endTime = performance.now();
        const metric: PerformanceMetric = {
            operation,
            startTime: endTime - duration,
            endTime,
            duration,
            metadata
        };
        
        this.addMetric(metric);
    }

    // Track filter-specific performance
    trackFilterOperation(metrics: FilterPerformanceMetrics): void {
        this.trackOperation(metrics.operation, metrics.duration, {
            itemCount: metrics.itemCount,
            batchSize: metrics.batchSize,
            batchCount: metrics.batchCount,
            cancelled: metrics.cancelled
        });
    }

    // Track rendering performance
    trackRenderOperation(itemCount: number, duration: number, batchSize?: number, batchCount?: number): void {
        this.trackFilterOperation({
            operation: 'render',
            itemCount,
            duration,
            batchSize,
            batchCount
        });
    }

    // Track search performance
    trackSearchOperation(query: string, resultCount: number, duration: number): void {
        this.trackOperation('search', duration, {
            query: query.substring(0, 50), // Truncate long queries
            queryLength: query.length,
            resultCount
        });
    }

    // Add a metric to the collection
    private addMetric(metric: PerformanceMetric): void {
        this.metrics.push(metric);
        
        // Keep only the most recent metrics
        if (this.metrics.length > this.maxMetrics) {
            this.metrics = this.metrics.slice(-this.maxMetrics);
        }
    }

    // Generate performance report
    generateReport(operationType?: string): PerformanceReport {
        let filteredMetrics = this.metrics;
        
        if (operationType) {
            filteredMetrics = this.metrics.filter(m => m.operation === operationType);
        }

        if (filteredMetrics.length === 0) {
            return {
                totalOperations: 0,
                averageDuration: 0,
                minDuration: 0,
                maxDuration: 0,
                operations: []
            };
        }

        const durations = filteredMetrics.map(m => m.duration);
        
        return {
            totalOperations: filteredMetrics.length,
            averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
            minDuration: Math.min(...durations),
            maxDuration: Math.max(...durations),
            operations: filteredMetrics
        };
    }

    // Get recent metrics
    getRecentMetrics(count: number = 10): PerformanceMetric[] {
        return this.metrics.slice(-count);
    }

    // Clear all metrics
    clearMetrics(): void {
        this.metrics = [];
        this.activeOperations.clear();
    }

    // Get metrics summary for console logging
    getMetricsSummary(): string {
        const report = this.generateReport();
        if (report.totalOperations === 0) {
            return 'No performance metrics collected';
        }

        return `Performance Summary:
- Total Operations: ${report.totalOperations}
- Average Duration: ${report.averageDuration.toFixed(2)}ms
- Min Duration: ${report.minDuration.toFixed(2)}ms
- Max Duration: ${report.maxDuration.toFixed(2)}ms`;
    }

    // Log performance summary to console
    logSummary(): void {
        console.log(this.getMetricsSummary());
    }

    // Check if performance is degraded
    isPerformanceDegraded(operationType: string, thresholdMs: number = 1000): boolean {
        const report = this.generateReport(operationType);
        return report.averageDuration > thresholdMs || report.maxDuration > thresholdMs * 2;
    }

    // Get performance insights
    getInsights(): string[] {
        const insights: string[] = [];
        const report = this.generateReport();
        
        if (report.totalOperations === 0) {
            return ['No performance data available'];
        }

        if (report.averageDuration > 500) {
            insights.push(`Average operation time (${report.averageDuration.toFixed(2)}ms) is high - consider optimization`);
        }

        if (report.maxDuration > 2000) {
            insights.push(`Slowest operation (${report.maxDuration.toFixed(2)}ms) is very slow - investigate bottlenecks`);
        }

        const renderReport = this.generateReport('render');
        if (renderReport.totalOperations > 0 && renderReport.averageDuration > 300) {
            insights.push(`Rendering performance could be improved (avg: ${renderReport.averageDuration.toFixed(2)}ms)`);
        }

        const searchReport = this.generateReport('search');
        if (searchReport.totalOperations > 0 && searchReport.averageDuration > 200) {
            insights.push(`Search performance could be improved (avg: ${searchReport.averageDuration.toFixed(2)}ms)`);
        }

        if (insights.length === 0) {
            insights.push('Performance looks good!');
        }

        return insights;
    }

    // Auto-adjust batch size based on performance
    getOptimalBatchSize(currentBatchSize: number = 10): number {
        const renderReport = this.generateReport('render');
        
        if (renderReport.totalOperations < 3) {
            return currentBatchSize; // Not enough data
        }

        const avgDuration = renderReport.averageDuration;
        
        // If rendering is fast, we can increase batch size
        if (avgDuration < 50) {
            return Math.min(currentBatchSize + 5, 50);
        }
        
        // If rendering is slow, decrease batch size
        if (avgDuration > 200) {
            return Math.max(currentBatchSize - 2, 5);
        }
        
        return currentBatchSize;
    }
}