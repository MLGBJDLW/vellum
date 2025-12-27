/**
 * OpenTelemetry SDK setup and configuration
 * @module telemetry/setup
 */

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter, TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-node";

import type { TelemetryConfig } from "./types.js";

/** Singleton SDK instance */
let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK with the provided configuration
 *
 * @param config - Telemetry configuration
 *
 * @example
 * ```typescript
 * setupTelemetry({
 *   enabled: true,
 *   serviceName: 'my-app',
 *   exporterType: 'console',
 *   samplingRatio: 0.5,
 * });
 * ```
 */
export function setupTelemetry(config: TelemetryConfig): void {
  // Early return if telemetry is disabled
  if (!config.enabled) {
    return;
  }

  // Prevent double initialization
  if (sdk !== null) {
    return;
  }

  // Create exporter based on config
  const exporter = createExporter(config);

  // Create sampler with configured ratio (default to 100% sampling)
  const samplingRatio = config.samplingRatio ?? 1.0;
  const clampedRatio = Math.max(0, Math.min(1, samplingRatio));
  const sampler = new TraceIdRatioBasedSampler(clampedRatio);

  // Create resource with service identification
  const resource = new Resource({
    "service.name": config.serviceName ?? "vellum",
    "service.version": config.serviceVersion ?? "0.0.0",
  });

  // Initialize SDK
  sdk = new NodeSDK({
    resource,
    traceExporter: exporter,
    sampler,
  });

  sdk.start();
}

/**
 * Create the appropriate span exporter based on configuration
 */
function createExporter(
  config: TelemetryConfig
): ConsoleSpanExporter | OTLPTraceExporter | undefined {
  switch (config.exporterType) {
    case "console":
      return new ConsoleSpanExporter();
    case "otlp":
      return new OTLPTraceExporter({
        url: config.otlpEndpoint,
      });
    case "none":
    default:
      return undefined;
  }
}

/**
 * Gracefully shutdown the OpenTelemetry SDK
 * Should be called before process exit to flush pending spans
 *
 * @example
 * ```typescript
 * process.on('SIGTERM', async () => {
 *   await shutdownTelemetry();
 *   process.exit(0);
 * });
 * ```
 */
export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}

/**
 * Create telemetry configuration from environment variables
 *
 * Supported environment variables:
 * - VELLUM_TELEMETRY_ENABLED: 'true' to enable telemetry
 * - OTEL_SERVICE_NAME / VELLUM_SERVICE_NAME: Service name (default: 'vellum')
 * - VELLUM_SERVICE_VERSION: Service version
 * - VELLUM_TELEMETRY_EXPORTER: 'console' | 'otlp' | 'none' (default: 'console')
 * - OTEL_EXPORTER_OTLP_ENDPOINT / VELLUM_OTLP_ENDPOINT: OTLP endpoint URL
 * - VELLUM_TELEMETRY_SAMPLING_RATIO: Sampling ratio 0.0-1.0 (default: 1.0)
 *
 * @returns TelemetryConfig parsed from environment
 *
 * @example
 * ```typescript
 * // Set env vars
 * process.env.VELLUM_TELEMETRY_ENABLED = 'true';
 * process.env.VELLUM_TELEMETRY_EXPORTER = 'otlp';
 * process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318/v1/traces';
 *
 * const config = createTelemetryConfigFromEnv();
 * setupTelemetry(config);
 * ```
 */
export function createTelemetryConfigFromEnv(): TelemetryConfig {
  const exporterType = parseExporterType(process.env.VELLUM_TELEMETRY_EXPORTER);
  const samplingRatio = parseSamplingRatio(process.env.VELLUM_TELEMETRY_SAMPLING_RATIO);

  return {
    enabled: process.env.VELLUM_TELEMETRY_ENABLED === "true",
    serviceName: process.env.OTEL_SERVICE_NAME ?? process.env.VELLUM_SERVICE_NAME ?? "vellum",
    serviceVersion: process.env.VELLUM_SERVICE_VERSION,
    exporterType,
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? process.env.VELLUM_OTLP_ENDPOINT,
    samplingRatio,
  };
}

/**
 * Parse and validate exporter type from environment variable
 */
function parseExporterType(value: string | undefined): TelemetryConfig["exporterType"] {
  const validTypes = ["console", "otlp", "none"] as const;
  if (value && validTypes.includes(value as (typeof validTypes)[number])) {
    return value as TelemetryConfig["exporterType"];
  }
  return "console";
}

/**
 * Parse and validate sampling ratio from environment variable
 */
function parseSamplingRatio(value: string | undefined): number {
  if (!value) {
    return 1.0;
  }
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed)) {
    return 1.0;
  }
  // Clamp to valid range
  return Math.max(0, Math.min(1, parsed));
}

/**
 * Check if telemetry SDK is currently active
 * Useful for testing and conditional logic
 */
export function isTelemetryActive(): boolean {
  return sdk !== null;
}

/**
 * Reset telemetry state (for testing purposes)
 * @internal
 */
export function _resetTelemetryForTesting(): void {
  sdk = null;
}
