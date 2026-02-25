class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  private enabled = import.meta.env.DEV;

  startMeasure(label: string): number {
    return performance.now();
  }

  endMeasure(label: string, startTime: number): void {
    if (!this.enabled) return;

    const duration = performance.now() - startTime;
    if (!this.metrics.has(label)) {
      this.metrics.set(label, []);
    }
    this.metrics.get(label)!.push(duration);
  }

  getStats(label: string) {
    const measurements = this.metrics.get(label) || [];
    if (measurements.length === 0) return null;

    measurements.sort((a, b) => a - b);
    return {
      count: measurements.length,
      avg: measurements.reduce((a, b) => a + b, 0) / measurements.length,
      min: measurements[0],
      max: measurements[measurements.length - 1],
      p50: measurements[Math.floor(measurements.length * 0.5)],
      p95: measurements[Math.floor(measurements.length * 0.95)]
    };
  }

  report(): void {
    if (!this.enabled) return;

    console.table(
      Array.from(this.metrics.keys()).map(label => ({
        Operation: label,
        ...this.getStats(label)
      }))
    );
  }

  clear(): void {
    this.metrics.clear();
  }
}

export const perfMonitor = new PerformanceMonitor();
