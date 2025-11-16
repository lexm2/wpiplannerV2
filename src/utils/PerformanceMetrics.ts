export interface PerformanceMetric {
    operation: string;
    startTime: number;
    endTime: number;
    duration: number;
    metadata?: Record<string, unknown>;
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

enum PerformanceThresholds {
    DEFAULT_THRESHOLD = 1_000,
    THRESHOLD_MULTIPLIER = 2,
    AVERAGE_HIGH = 500,
    MAX_VERY_SLOW = 2_000,
    RENDER_AVERAGE_THRESHOLD = 300,
    SEARCH_AVERAGE_THRESHOLD = 200,
    RENDER_FAST = 50,
    RENDER_SLOW = 200,
    BATCH_SIZE_MIN = 5,
    BATCH_SIZE_MAX = 50,
    BATCH_SIZE_INCREASE = 5,
    BATCH_SIZE_DECREASE = 2,
    MAX_METRICS_COUNT = 100,
    MAX_QUERY_LENGTH = 50,
    DEFAULT_RECENT_COUNT = 10,
    MIN_OPERATIONS_FOR_OPTIMIZATION = 3
}

export class PerformanceMetrics {
    private metrics: PerformanceMetric[] = [];
    private maxMetrics: number = PerformanceThresholds.MAX_METRICS_COUNT;
    private activeOperations = new Map<string, number>();

    // Start timing an operation
    startOperation(operation: string): string {
        const operationId = `${operation}_${Date.now()}_${Math.random()}`;
        this.activeOperations.set(operationId, performance.now());
        return operationId;
    }

    // End timing an operation
    endOperation(operationId: string, metadata?: Record<string, unknown>): PerformanceMetric | null {
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
    trackOperation(operation: string, duration: number, metadata?: Record<string, unknown>): void {
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
            query: query.substring(0, PerformanceThresholds.MAX_QUERY_LENGTH),
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

        let sum = 0;
        let min = Infinity;
        let max = -Infinity;

        for (const metric of filteredMetrics) {
            sum += metric.duration;
            if (metric.duration < min) min = metric.duration;
            if (metric.duration > max) max = metric.duration;
        }

        return {
            totalOperations: filteredMetrics.length,
            averageDuration: sum / filteredMetrics.length,
            minDuration: min,
            maxDuration: max,
            operations: filteredMetrics
        };
    }

    // Get recent metrics
    getRecentMetrics(count = PerformanceThresholds.DEFAULT_RECENT_COUNT): PerformanceMetric[] {
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
    isPerformanceDegraded(operationType: string, thresholdMs = PerformanceThresholds.DEFAULT_THRESHOLD): boolean {
        const report = this.generateReport(operationType);
        return report.averageDuration > thresholdMs || report.maxDuration > thresholdMs * PerformanceThresholds.THRESHOLD_MULTIPLIER;
    }

    // Get performance insights
    getInsights(): string[] {
        const insights: string[] = [];
        const report = this.generateReport();
        
        if (report.totalOperations === 0) {
            return ['No performance data available'];
        }

        if (report.averageDuration > PerformanceThresholds.AVERAGE_HIGH) {
            insights.push(`Average operation time (${report.averageDuration.toFixed(2)}ms) is high - consider optimization`);
        }

        if (report.maxDuration > PerformanceThresholds.MAX_VERY_SLOW) {
            insights.push(`Slowest operation (${report.maxDuration.toFixed(2)}ms) is very slow - investigate bottlenecks`);
        }

        const renderReport = this.generateReport('render');
        if (renderReport.totalOperations > 0 && renderReport.averageDuration > PerformanceThresholds.RENDER_AVERAGE_THRESHOLD) {
            insights.push(`Rendering performance could be improved (avg: ${renderReport.averageDuration.toFixed(2)}ms)`);
        }

        const searchReport = this.generateReport('search');
        if (searchReport.totalOperations > 0 && searchReport.averageDuration > PerformanceThresholds.SEARCH_AVERAGE_THRESHOLD) {
            insights.push(`Search performance could be improved (avg: ${searchReport.averageDuration.toFixed(2)}ms)`);
        }

        if (insights.length === 0) {
            insights.push('Performance looks good!');
        }

        return insights;
    }

    // Auto-adjust batch size based on performance
    getOptimalBatchSize(currentBatchSize = PerformanceThresholds.DEFAULT_RECENT_COUNT): number {
        const renderReport = this.generateReport('render');

        if (renderReport.totalOperations < PerformanceThresholds.MIN_OPERATIONS_FOR_OPTIMIZATION) {
            return currentBatchSize;
        }

        const avgDuration = renderReport.averageDuration;

        if (avgDuration < PerformanceThresholds.RENDER_FAST) {
            return Math.min(currentBatchSize + PerformanceThresholds.BATCH_SIZE_INCREASE, PerformanceThresholds.BATCH_SIZE_MAX);
        }

        if (avgDuration > PerformanceThresholds.RENDER_SLOW) {
            return Math.max(currentBatchSize - PerformanceThresholds.BATCH_SIZE_DECREASE, PerformanceThresholds.BATCH_SIZE_MIN);
        }

        return currentBatchSize;
    }
}