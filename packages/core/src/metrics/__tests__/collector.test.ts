import { beforeEach, describe, expect, it } from "vitest";
import { MetricsCollector } from "../collector.js";
import {
  activeConnections,
  completionTokensTotal,
  llmRequestDuration,
  llmRequestErrors,
  llmRequestsTotal,
  memoryUsageBytes,
  promptTokensTotal,
} from "../vellum-metrics.js";

describe("MetricsCollector", () => {
  beforeEach(() => {
    MetricsCollector.resetInstance();
  });

  describe("singleton", () => {
    it("returns the same instance", () => {
      const instance1 = MetricsCollector.getInstance();
      const instance2 = MetricsCollector.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("creates new instance after reset", () => {
      const instance1 = MetricsCollector.getInstance();
      MetricsCollector.resetInstance();
      const instance2 = MetricsCollector.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("Counter", () => {
    it("creates counter with inc/get/reset methods", () => {
      const collector = MetricsCollector.getInstance();
      const counter = collector.createCounter({
        name: "test_counter",
        description: "Test counter",
      });

      expect(counter.get()).toBe(0);
      counter.inc();
      expect(counter.get()).toBe(1);
      counter.inc({}, 5);
      expect(counter.get()).toBe(6);
      counter.reset();
      expect(counter.get()).toBe(0);
    });

    it("supports labels", () => {
      const collector = MetricsCollector.getInstance();
      const counter = collector.createCounter({
        name: "labeled_counter",
        labels: ["provider", "status"],
      });

      counter.inc({ provider: "openai", status: "success" });
      counter.inc({ provider: "openai", status: "error" });
      counter.inc({ provider: "anthropic", status: "success" }, 3);

      expect(counter.get({ provider: "openai", status: "success" })).toBe(1);
      expect(counter.get({ provider: "openai", status: "error" })).toBe(1);
      expect(counter.get({ provider: "anthropic", status: "success" })).toBe(3);
      expect(counter.get({ provider: "google", status: "success" })).toBe(0);
    });

    it("resets only specific labels", () => {
      const collector = MetricsCollector.getInstance();
      const counter = collector.createCounter({ name: "reset_test" });

      counter.inc({ type: "a" }, 10);
      counter.inc({ type: "b" }, 20);
      counter.reset({ type: "a" });

      expect(counter.get({ type: "a" })).toBe(0);
      expect(counter.get({ type: "b" })).toBe(20);
    });
  });

  describe("Histogram", () => {
    it("creates histogram with observe/getStats/reset methods", () => {
      const collector = MetricsCollector.getInstance();
      const histogram = collector.createHistogram({
        name: "test_histogram",
        description: "Test histogram",
      });

      expect(histogram.getStats()).toEqual({
        count: 0,
        sum: 0,
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p90: 0,
        p99: 0,
      });
    });

    it("calculates correct stats", () => {
      const collector = MetricsCollector.getInstance();
      const histogram = collector.createHistogram({ name: "stats_test" });

      // Add values 1-10
      for (let i = 1; i <= 10; i++) {
        histogram.observe(i);
      }

      const stats = histogram.getStats();
      expect(stats.count).toBe(10);
      expect(stats.sum).toBe(55);
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(10);
      expect(stats.avg).toBe(5.5);
    });

    it("calculates percentiles", () => {
      const collector = MetricsCollector.getInstance();
      const histogram = collector.createHistogram({ name: "percentile_test" });

      // Add values 1-100
      for (let i = 1; i <= 100; i++) {
        histogram.observe(i);
      }

      const stats = histogram.getStats();
      expect(stats.p50).toBe(50);
      expect(stats.p90).toBe(90);
      expect(stats.p99).toBe(99);
    });

    it("supports labels", () => {
      const collector = MetricsCollector.getInstance();
      const histogram = collector.createHistogram({ name: "labeled_hist" });

      histogram.observe(100, { provider: "openai" });
      histogram.observe(200, { provider: "openai" });
      histogram.observe(50, { provider: "anthropic" });

      const openaiStats = histogram.getStats({ provider: "openai" });
      const anthropicStats = histogram.getStats({ provider: "anthropic" });

      expect(openaiStats.count).toBe(2);
      expect(openaiStats.avg).toBe(150);
      expect(anthropicStats.count).toBe(1);
      expect(anthropicStats.avg).toBe(50);
    });

    it("resets only specific labels", () => {
      const collector = MetricsCollector.getInstance();
      const histogram = collector.createHistogram({ name: "reset_hist" });

      histogram.observe(100, { type: "a" });
      histogram.observe(200, { type: "b" });
      histogram.reset({ type: "a" });

      expect(histogram.getStats({ type: "a" }).count).toBe(0);
      expect(histogram.getStats({ type: "b" }).count).toBe(1);
    });
  });

  describe("Gauge", () => {
    it("creates gauge with set/inc/dec/get methods", () => {
      const collector = MetricsCollector.getInstance();
      const gauge = collector.createGauge({
        name: "test_gauge",
        description: "Test gauge",
      });

      expect(gauge.get()).toBe(0);
      gauge.set(100);
      expect(gauge.get()).toBe(100);
      gauge.inc();
      expect(gauge.get()).toBe(101);
      gauge.inc({}, 9);
      expect(gauge.get()).toBe(110);
      gauge.dec();
      expect(gauge.get()).toBe(109);
      gauge.dec({}, 9);
      expect(gauge.get()).toBe(100);
    });

    it("supports labels", () => {
      const collector = MetricsCollector.getInstance();
      const gauge = collector.createGauge({ name: "labeled_gauge" });

      gauge.set(10, { region: "us" });
      gauge.set(20, { region: "eu" });
      gauge.inc({ region: "us" }, 5);
      gauge.dec({ region: "eu" }, 5);

      expect(gauge.get({ region: "us" })).toBe(15);
      expect(gauge.get({ region: "eu" })).toBe(15);
      expect(gauge.get({ region: "asia" })).toBe(0);
    });
  });
});

describe("Vellum Preset Metrics", () => {
  beforeEach(() => {
    MetricsCollector.resetInstance();
  });

  it("exports llmRequestsTotal counter", () => {
    // Re-import after reset to get fresh metrics
    // Note: These are created once on module load, so we test their interface
    expect(typeof llmRequestsTotal.inc).toBe("function");
    expect(typeof llmRequestsTotal.get).toBe("function");
    expect(typeof llmRequestsTotal.reset).toBe("function");
  });

  it("exports llmRequestErrors counter", () => {
    expect(typeof llmRequestErrors.inc).toBe("function");
    expect(typeof llmRequestErrors.get).toBe("function");
    expect(typeof llmRequestErrors.reset).toBe("function");
  });

  it("exports token counters", () => {
    expect(typeof promptTokensTotal.inc).toBe("function");
    expect(typeof completionTokensTotal.inc).toBe("function");
  });

  it("exports llmRequestDuration histogram", () => {
    expect(typeof llmRequestDuration.observe).toBe("function");
    expect(typeof llmRequestDuration.getStats).toBe("function");
    expect(typeof llmRequestDuration.reset).toBe("function");
  });

  it("exports memoryUsageBytes gauge", () => {
    expect(typeof memoryUsageBytes.set).toBe("function");
    expect(typeof memoryUsageBytes.inc).toBe("function");
    expect(typeof memoryUsageBytes.dec).toBe("function");
    expect(typeof memoryUsageBytes.get).toBe("function");
  });

  it("exports activeConnections gauge", () => {
    expect(typeof activeConnections.set).toBe("function");
    expect(typeof activeConnections.get).toBe("function");
  });
});
