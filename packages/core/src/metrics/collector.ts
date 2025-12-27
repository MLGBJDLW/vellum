/**
 * Metrics Collection System
 *
 * Provides Counter, Histogram, and Gauge metric types following
 * Prometheus-style conventions for observability.
 */

// ============================================================================
// Counter Types
// ============================================================================

export interface CounterOptions {
  name: string;
  description?: string;
  labels?: string[];
}

export interface Counter {
  inc(labels?: Record<string, string>, value?: number): void;
  get(labels?: Record<string, string>): number;
  reset(labels?: Record<string, string>): void;
}

// ============================================================================
// Histogram Types
// ============================================================================

export interface HistogramOptions {
  name: string;
  description?: string;
  buckets?: number[];
}

export interface HistogramStats {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p90: number;
  p99: number;
}

export interface Histogram {
  observe(value: number, labels?: Record<string, string>): void;
  getStats(labels?: Record<string, string>): HistogramStats;
  reset(labels?: Record<string, string>): void;
}

// ============================================================================
// Gauge Types
// ============================================================================

export interface GaugeOptions {
  name: string;
  description?: string;
}

export interface Gauge {
  set(value: number, labels?: Record<string, string>): void;
  inc(labels?: Record<string, string>, value?: number): void;
  dec(labels?: Record<string, string>, value?: number): void;
  get(labels?: Record<string, string>): number;
}

// ============================================================================
// MetricsCollector Singleton
// ============================================================================

export class MetricsCollector {
  private static instance: MetricsCollector;

  private counters = new Map<string, Map<string, number>>();
  private histograms = new Map<string, Map<string, number[]>>();
  private gauges = new Map<string, Map<string, number>>();

  private constructor() {}

  /**
   * Get the singleton instance of MetricsCollector
   */
  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    MetricsCollector.instance = undefined as unknown as MetricsCollector;
  }

  // ==========================================================================
  // Counter Implementation
  // ==========================================================================

  /**
   * Create a counter metric that can only increase
   */
  createCounter(options: CounterOptions): Counter {
    const { name } = options;
    if (!this.counters.has(name)) {
      this.counters.set(name, new Map());
    }
    const counterMap = this.counters.get(name)!;

    return {
      inc: (labels = {}, value = 1) => {
        const key = this.serializeLabels(labels);
        counterMap.set(key, (counterMap.get(key) ?? 0) + value);
      },
      get: (labels = {}) => {
        const key = this.serializeLabels(labels);
        return counterMap.get(key) ?? 0;
      },
      reset: (labels = {}) => {
        const key = this.serializeLabels(labels);
        counterMap.set(key, 0);
      },
    };
  }

  // ==========================================================================
  // Histogram Implementation
  // ==========================================================================

  /**
   * Create a histogram metric for observing value distributions
   */
  createHistogram(options: HistogramOptions): Histogram {
    const { name } = options;
    if (!this.histograms.has(name)) {
      this.histograms.set(name, new Map());
    }
    const histMap = this.histograms.get(name)!;

    return {
      observe: (value, labels = {}) => {
        const key = this.serializeLabels(labels);
        if (!histMap.has(key)) histMap.set(key, []);
        histMap.get(key)!.push(value);
      },
      getStats: (labels = {}): HistogramStats => {
        const key = this.serializeLabels(labels);
        const values = histMap.get(key) ?? [];
        if (values.length === 0) {
          return { count: 0, sum: 0, min: 0, max: 0, avg: 0, p50: 0, p90: 0, p99: 0 };
        }
        const sorted = [...values].sort((a, b) => a - b);
        const sum = values.reduce((a, b) => a + b, 0);
        const min = sorted[0]!;
        const max = sorted[sorted.length - 1]!;
        return {
          count: values.length,
          sum,
          min,
          max,
          avg: sum / values.length,
          p50: this.percentile(sorted, 50),
          p90: this.percentile(sorted, 90),
          p99: this.percentile(sorted, 99),
        };
      },
      reset: (labels = {}) => {
        const key = this.serializeLabels(labels);
        histMap.set(key, []);
      },
    };
  }

  // ==========================================================================
  // Gauge Implementation
  // ==========================================================================

  /**
   * Create a gauge metric that can increase or decrease
   */
  createGauge(options: GaugeOptions): Gauge {
    const { name } = options;
    if (!this.gauges.has(name)) {
      this.gauges.set(name, new Map());
    }
    const gaugeMap = this.gauges.get(name)!;

    return {
      set: (value, labels = {}) => {
        const key = this.serializeLabels(labels);
        gaugeMap.set(key, value);
      },
      inc: (labels = {}, value = 1) => {
        const key = this.serializeLabels(labels);
        gaugeMap.set(key, (gaugeMap.get(key) ?? 0) + value);
      },
      dec: (labels = {}, value = 1) => {
        const key = this.serializeLabels(labels);
        gaugeMap.set(key, (gaugeMap.get(key) ?? 0) - value);
      },
      get: (labels = {}) => {
        const key = this.serializeLabels(labels);
        return gaugeMap.get(key) ?? 0;
      },
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Serialize labels to a consistent string key
   */
  private serializeLabels(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sorted: number[], p: number): number {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)]!;
  }
}
