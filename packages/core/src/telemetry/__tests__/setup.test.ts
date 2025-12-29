import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetTelemetryForTesting,
  createTelemetryConfigFromEnv,
  isTelemetryActive,
  setupTelemetry,
  shutdownTelemetry,
} from "../setup.js";
import type { TelemetryConfig } from "../types.js";

// Track mock instances for assertions
const mockSdkInstances: Array<{
  start: ReturnType<typeof vi.fn>;
  shutdown: ReturnType<typeof vi.fn>;
  _config: unknown;
}> = [];

const mockConsoleExporterInstances: Array<{ type: string }> = [];
const mockOtlpExporterInstances: Array<{ type: string; url?: string }> = [];
const mockSamplerInstances: Array<{ type: string; ratio: number }> = [];
const mockResourceInstances: Array<{
  type: string;
  attributes: Record<string, string>;
}> = [];

// Mock the OpenTelemetry modules with proper class mocks
vi.mock("@opentelemetry/sdk-node", () => {
  return {
    NodeSDK: class MockNodeSDK {
      _config: unknown;
      start = vi.fn();
      shutdown = vi.fn().mockResolvedValue(undefined);
      constructor(config: unknown) {
        this._config = config;
        mockSdkInstances.push(this);
      }
    },
  };
});

vi.mock("@opentelemetry/sdk-trace-node", () => {
  return {
    ConsoleSpanExporter: class MockConsoleSpanExporter {
      type = "console";
      constructor() {
        mockConsoleExporterInstances.push(this);
      }
    },
    TraceIdRatioBasedSampler: class MockTraceIdRatioBasedSampler {
      type = "ratio-sampler";
      ratio: number;
      constructor(ratio: number) {
        this.ratio = ratio;
        mockSamplerInstances.push(this);
      }
    },
  };
});

vi.mock("@opentelemetry/exporter-trace-otlp-http", () => {
  return {
    OTLPTraceExporter: class MockOTLPTraceExporter {
      type = "otlp";
      url?: string;
      constructor(config?: { url?: string }) {
        this.url = config?.url;
        mockOtlpExporterInstances.push(this);
      }
    },
  };
});

vi.mock("@opentelemetry/resources", () => {
  return {
    Resource: class MockResource {
      type = "resource";
      attributes: Record<string, string>;
      constructor(attributes: Record<string, string>) {
        this.attributes = attributes;
        mockResourceInstances.push(this);
      }
    },
  };
});

describe("telemetry/setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetTelemetryForTesting();
    // Clear tracking arrays
    mockSdkInstances.length = 0;
    mockConsoleExporterInstances.length = 0;
    mockOtlpExporterInstances.length = 0;
    mockSamplerInstances.length = 0;
    mockResourceInstances.length = 0;
  });

  afterEach(async () => {
    await shutdownTelemetry();
    _resetTelemetryForTesting();
  });

  describe("setupTelemetry", () => {
    it("does nothing when enabled is false", () => {
      const config: TelemetryConfig = {
        enabled: false,
        exporterType: "console",
      };

      setupTelemetry(config);

      expect(mockSdkInstances).toHaveLength(0);
      expect(isTelemetryActive()).toBe(false);
    });

    it("initializes SDK with console exporter", () => {
      const config: TelemetryConfig = {
        enabled: true,
        serviceName: "test-service",
        serviceVersion: "1.0.0",
        exporterType: "console",
        samplingRatio: 1.0,
      };

      setupTelemetry(config);

      expect(mockSdkInstances).toHaveLength(1);
      expect(mockConsoleExporterInstances).toHaveLength(1);
      expect(isTelemetryActive()).toBe(true);

      // Verify SDK was started
      const sdkInstance = mockSdkInstances[0];
      expect(sdkInstance).toBeDefined();
      expect(sdkInstance?.start).toHaveBeenCalled();
    });

    it("initializes SDK with OTLP exporter", () => {
      const config: TelemetryConfig = {
        enabled: true,
        serviceName: "test-service",
        exporterType: "otlp",
        otlpEndpoint: "http://localhost:4318/v1/traces",
      };

      setupTelemetry(config);

      expect(mockSdkInstances).toHaveLength(1);
      expect(mockOtlpExporterInstances).toHaveLength(1);
      const otlpExporter = mockOtlpExporterInstances[0];
      expect(otlpExporter).toBeDefined();
      expect(otlpExporter?.url).toBe("http://localhost:4318/v1/traces");
      expect(isTelemetryActive()).toBe(true);
    });

    it("initializes SDK with no exporter when type is none", () => {
      const config: TelemetryConfig = {
        enabled: true,
        exporterType: "none",
      };

      setupTelemetry(config);

      expect(mockSdkInstances).toHaveLength(1);
      expect(mockConsoleExporterInstances).toHaveLength(0);
      expect(mockOtlpExporterInstances).toHaveLength(0);
    });

    it("uses default service name and version when not provided", () => {
      const config: TelemetryConfig = {
        enabled: true,
        exporterType: "console",
      };

      setupTelemetry(config);

      expect(mockResourceInstances).toHaveLength(1);
      const resource = mockResourceInstances[0];
      expect(resource).toBeDefined();
      expect(resource?.attributes).toEqual({
        "service.name": "vellum",
        "service.version": "0.0.0",
      });
    });

    it("creates sampler with configured ratio", () => {
      const config: TelemetryConfig = {
        enabled: true,
        exporterType: "console",
        samplingRatio: 0.5,
      };

      setupTelemetry(config);

      expect(mockSamplerInstances).toHaveLength(1);
      const sampler = mockSamplerInstances[0];
      expect(sampler).toBeDefined();
      expect(sampler?.ratio).toBe(0.5);
    });

    it("clamps sampling ratio to valid range", () => {
      // Test ratio > 1
      setupTelemetry({
        enabled: true,
        exporterType: "console",
        samplingRatio: 2.0,
      });

      expect(mockSamplerInstances).toHaveLength(1);
      const samplerHigh = mockSamplerInstances[0];
      expect(samplerHigh).toBeDefined();
      expect(samplerHigh?.ratio).toBe(1.0);

      // Reset for next test
      _resetTelemetryForTesting();
      mockSdkInstances.length = 0;
      mockSamplerInstances.length = 0;
      mockConsoleExporterInstances.length = 0;
      mockResourceInstances.length = 0;

      // Test ratio < 0
      setupTelemetry({
        enabled: true,
        exporterType: "console",
        samplingRatio: -0.5,
      });

      expect(mockSamplerInstances).toHaveLength(1);
      const samplerLow = mockSamplerInstances[0];
      expect(samplerLow).toBeDefined();
      expect(samplerLow?.ratio).toBe(0);
    });

    it("prevents double initialization", () => {
      const config: TelemetryConfig = {
        enabled: true,
        exporterType: "console",
      };

      setupTelemetry(config);
      setupTelemetry(config);

      expect(mockSdkInstances).toHaveLength(1);
    });
  });

  describe("shutdownTelemetry", () => {
    it("shuts down SDK when active", async () => {
      setupTelemetry({
        enabled: true,
        exporterType: "console",
      });

      expect(isTelemetryActive()).toBe(true);

      await shutdownTelemetry();

      const sdkInstance = mockSdkInstances[0];
      expect(sdkInstance).toBeDefined();
      expect(sdkInstance?.shutdown).toHaveBeenCalled();
      expect(isTelemetryActive()).toBe(false);
    });

    it("does nothing when SDK not active", async () => {
      // Should not throw
      await expect(shutdownTelemetry()).resolves.toBeUndefined();
    });

    it("allows re-initialization after shutdown", () => {
      setupTelemetry({
        enabled: true,
        exporterType: "console",
      });

      // Manually trigger shutdown effect
      _resetTelemetryForTesting();

      setupTelemetry({
        enabled: true,
        exporterType: "otlp",
        otlpEndpoint: "http://localhost:4318",
      });

      expect(mockSdkInstances).toHaveLength(2);
      expect(isTelemetryActive()).toBe(true);
    });
  });

  describe("createTelemetryConfigFromEnv", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("returns disabled config when VELLUM_TELEMETRY_ENABLED is not set", () => {
      delete process.env.VELLUM_TELEMETRY_ENABLED;

      const config = createTelemetryConfigFromEnv();

      expect(config.enabled).toBe(false);
    });

    it("returns enabled config when VELLUM_TELEMETRY_ENABLED is true", () => {
      process.env.VELLUM_TELEMETRY_ENABLED = "true";

      const config = createTelemetryConfigFromEnv();

      expect(config.enabled).toBe(true);
    });

    it("returns disabled config when VELLUM_TELEMETRY_ENABLED is not exactly true", () => {
      process.env.VELLUM_TELEMETRY_ENABLED = "yes";

      const config = createTelemetryConfigFromEnv();

      expect(config.enabled).toBe(false);
    });

    it("reads service name from OTEL_SERVICE_NAME first", () => {
      process.env.OTEL_SERVICE_NAME = "otel-service";
      process.env.VELLUM_SERVICE_NAME = "vellum-service";

      const config = createTelemetryConfigFromEnv();

      expect(config.serviceName).toBe("otel-service");
    });

    it("reads service name from VELLUM_SERVICE_NAME when OTEL not set", () => {
      delete process.env.OTEL_SERVICE_NAME;
      process.env.VELLUM_SERVICE_NAME = "vellum-service";

      const config = createTelemetryConfigFromEnv();

      expect(config.serviceName).toBe("vellum-service");
    });

    it("defaults service name to vellum when not set", () => {
      delete process.env.OTEL_SERVICE_NAME;
      delete process.env.VELLUM_SERVICE_NAME;

      const config = createTelemetryConfigFromEnv();

      expect(config.serviceName).toBe("vellum");
    });

    it("reads service version from VELLUM_SERVICE_VERSION", () => {
      process.env.VELLUM_SERVICE_VERSION = "2.0.0";

      const config = createTelemetryConfigFromEnv();

      expect(config.serviceVersion).toBe("2.0.0");
    });

    it("reads exporter type from VELLUM_TELEMETRY_EXPORTER", () => {
      process.env.VELLUM_TELEMETRY_EXPORTER = "otlp";

      const config = createTelemetryConfigFromEnv();

      expect(config.exporterType).toBe("otlp");
    });

    it("defaults exporter type to console for invalid value", () => {
      process.env.VELLUM_TELEMETRY_EXPORTER = "invalid";

      const config = createTelemetryConfigFromEnv();

      expect(config.exporterType).toBe("console");
    });

    it("reads OTLP endpoint from OTEL_EXPORTER_OTLP_ENDPOINT first", () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://otel:4318";
      process.env.VELLUM_OTLP_ENDPOINT = "http://vellum:4318";

      const config = createTelemetryConfigFromEnv();

      expect(config.otlpEndpoint).toBe("http://otel:4318");
    });

    it("reads OTLP endpoint from VELLUM_OTLP_ENDPOINT when OTEL not set", () => {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      process.env.VELLUM_OTLP_ENDPOINT = "http://vellum:4318";

      const config = createTelemetryConfigFromEnv();

      expect(config.otlpEndpoint).toBe("http://vellum:4318");
    });

    it("reads sampling ratio from VELLUM_TELEMETRY_SAMPLING_RATIO", () => {
      process.env.VELLUM_TELEMETRY_SAMPLING_RATIO = "0.25";

      const config = createTelemetryConfigFromEnv();

      expect(config.samplingRatio).toBe(0.25);
    });

    it("defaults sampling ratio to 1.0 when not set", () => {
      delete process.env.VELLUM_TELEMETRY_SAMPLING_RATIO;

      const config = createTelemetryConfigFromEnv();

      expect(config.samplingRatio).toBe(1.0);
    });

    it("defaults sampling ratio to 1.0 for invalid value", () => {
      process.env.VELLUM_TELEMETRY_SAMPLING_RATIO = "invalid";

      const config = createTelemetryConfigFromEnv();

      expect(config.samplingRatio).toBe(1.0);
    });

    it("clamps sampling ratio to valid range", () => {
      process.env.VELLUM_TELEMETRY_SAMPLING_RATIO = "2.5";

      const config = createTelemetryConfigFromEnv();

      expect(config.samplingRatio).toBe(1.0);
    });

    it("parses complete environment configuration", () => {
      process.env.VELLUM_TELEMETRY_ENABLED = "true";
      process.env.OTEL_SERVICE_NAME = "my-service";
      process.env.VELLUM_SERVICE_VERSION = "1.2.3";
      process.env.VELLUM_TELEMETRY_EXPORTER = "otlp";
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://collector:4318/v1/traces";
      process.env.VELLUM_TELEMETRY_SAMPLING_RATIO = "0.1";

      const config = createTelemetryConfigFromEnv();

      expect(config).toEqual({
        enabled: true,
        serviceName: "my-service",
        serviceVersion: "1.2.3",
        exporterType: "otlp",
        otlpEndpoint: "http://collector:4318/v1/traces",
        samplingRatio: 0.1,
      });
    });
  });

  describe("isTelemetryActive", () => {
    it("returns false when SDK not initialized", () => {
      expect(isTelemetryActive()).toBe(false);
    });

    it("returns true when SDK is initialized", () => {
      setupTelemetry({
        enabled: true,
        exporterType: "console",
      });

      expect(isTelemetryActive()).toBe(true);
    });

    it("returns false after shutdown", async () => {
      setupTelemetry({
        enabled: true,
        exporterType: "console",
      });

      await shutdownTelemetry();

      expect(isTelemetryActive()).toBe(false);
    });
  });
});
