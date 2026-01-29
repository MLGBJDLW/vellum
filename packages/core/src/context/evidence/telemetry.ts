/**
 * Evidence Pack Telemetry Service
 *
 * Provides telemetry recording and analysis for evidence pack generation.
 * Supports both in-memory storage and optional disk persistence.
 *
 * @packageDocumentation
 * @module context/evidence
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { EvidenceTelemetry, ProviderType } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * A recorded telemetry entry with session context.
 */
export interface TelemetryRecord {
  /** Unique session ID */
  readonly sessionId: string;
  /** Timestamp when recorded */
  readonly timestamp: number;
  /** Telemetry data from evidence pack build */
  readonly data: EvidenceTelemetry;
  /** Task outcome (if known) */
  readonly outcome?: "success" | "failure" | "abandoned";
}

/**
 * Configuration for the telemetry service.
 */
export interface TelemetryServiceConfig {
  /** Maximum records to keep in memory (default: 1000) */
  readonly maxRecords?: number;
  /** Enable disk persistence (default: false) */
  readonly persist?: boolean;
  /** Storage path for persistence */
  readonly storagePath?: string;
}

/**
 * Aggregate statistics from telemetry records.
 */
export interface TelemetryStats {
  /** Total number of sessions recorded */
  readonly totalSessions: number;
  /** Average build time in milliseconds */
  readonly avgBuildTimeMs: number;
  /** Average tokens used per session */
  readonly avgTokensUsed: number;
  /** Average latency per provider in milliseconds */
  readonly avgProviderLatency: Readonly<Record<string, number>>;
  /** Success rate (0-1) for sessions with known outcomes */
  readonly successRate: number;
  /** Hit rate per provider (evidence items / total items) */
  readonly providerHitRates: Readonly<Record<string, number>>;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_RECORDS = 1000;
const PROVIDER_TYPES: readonly ProviderType[] = ["diff", "search", "lsp"];

// =============================================================================
// Implementation
// =============================================================================

/**
 * Service for recording and analyzing evidence pack telemetry.
 *
 * Features:
 * - Circular buffer storage with configurable capacity
 * - Optional disk persistence for long-term analysis
 * - Aggregate statistics calculation
 * - JSON export for external analysis tools
 *
 * @example
 * ```typescript
 * const service = new EvidenceTelemetryService({ maxRecords: 500 });
 * service.record('session-123', telemetryData);
 * service.markOutcome('session-123', 'success');
 * const stats = service.getStats();
 * ```
 */
export class EvidenceTelemetryService {
  readonly #maxRecords: number;
  readonly #persist: boolean;
  readonly #storagePath: string | undefined;
  #records: TelemetryRecord[];

  constructor(config?: TelemetryServiceConfig) {
    this.#maxRecords = config?.maxRecords ?? DEFAULT_MAX_RECORDS;
    this.#persist = config?.persist ?? false;
    this.#storagePath = config?.storagePath;
    this.#records = [];

    // Load persisted records if enabled
    if (this.#persist && this.#storagePath) {
      this.#loadFromDisk();
    }
  }

  /**
   * Record telemetry from an evidence pack build.
   *
   * @param sessionId - Unique identifier for the session
   * @param telemetry - Telemetry data from the build
   */
  record(sessionId: string, telemetry: EvidenceTelemetry): void {
    const record: TelemetryRecord = {
      sessionId,
      timestamp: Date.now(),
      data: telemetry,
    };

    this.#addRecord(record);
  }

  /**
   * Mark the outcome of a session.
   * Updates the existing record if found.
   *
   * @param sessionId - Session to update
   * @param outcome - Task outcome
   */
  markOutcome(sessionId: string, outcome: "success" | "failure" | "abandoned"): void {
    const index = this.#records.findIndex((r) => r.sessionId === sessionId);
    if (index !== -1) {
      const existing = this.#records[index];
      if (existing) {
        // Create new record with outcome (maintain immutability of stored data)
        const updated: TelemetryRecord = {
          sessionId: existing.sessionId,
          timestamp: existing.timestamp,
          data: existing.data,
          outcome,
        };
        this.#records[index] = updated;
        this.#persistIfEnabled();
      }
    }
  }

  /**
   * Get recent telemetry records.
   *
   * @param limit - Maximum number of records to return (default: all)
   * @returns Readonly array of telemetry records
   */
  getRecords(limit?: number): readonly TelemetryRecord[] {
    if (limit === undefined || limit >= this.#records.length) {
      return [...this.#records];
    }
    // Return most recent records
    return this.#records.slice(-limit);
  }

  /**
   * Calculate aggregate statistics from recorded telemetry.
   *
   * @returns Aggregate statistics
   */
  getStats(): TelemetryStats {
    const total = this.#records.length;

    if (total === 0) {
      return {
        totalSessions: 0,
        avgBuildTimeMs: 0,
        avgTokensUsed: 0,
        avgProviderLatency: {},
        successRate: 0,
        providerHitRates: {},
      };
    }

    // Calculate averages
    let totalBuildTime = 0;
    let totalTokens = 0;
    const providerLatencies: Record<string, number[]> = {};
    let totalEvidence = 0;
    let successCount = 0;
    let outcomeCount = 0;

    for (const record of this.#records) {
      const { data, outcome } = record;

      totalBuildTime += data.totalMs;
      totalTokens +=
        data.evidenceCountAfterBudget > 0 ? data.tokensSaved + this.#estimateTokensUsed(data) : 0;

      // Track provider latencies
      for (const provider of PROVIDER_TYPES) {
        const latency = data.providerTimings[provider];
        if (latency !== undefined && latency > 0) {
          if (!providerLatencies[provider]) {
            providerLatencies[provider] = [];
          }
          providerLatencies[provider].push(latency);
        }
      }

      // Track evidence counts per provider (simplified heuristic)
      // In a real implementation, we'd track this in EvidenceTelemetry
      totalEvidence += data.evidenceCountAfterBudget;

      // Track outcomes
      if (outcome) {
        outcomeCount++;
        if (outcome === "success") {
          successCount++;
        }
      }
    }

    // Calculate average provider latencies
    const avgProviderLatency: Record<string, number> = {};
    for (const [provider, latencies] of Object.entries(providerLatencies)) {
      if (latencies.length > 0) {
        avgProviderLatency[provider] = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      }
    }

    // Calculate provider hit rates (providers with non-zero latency / total)
    const providerHitRates: Record<string, number> = {};
    for (const provider of PROVIDER_TYPES) {
      const hits = providerLatencies[provider]?.length ?? 0;
      providerHitRates[provider] = total > 0 ? hits / total : 0;
    }

    return {
      totalSessions: total,
      avgBuildTimeMs: totalBuildTime / total,
      avgTokensUsed: totalTokens / total,
      avgProviderLatency,
      successRate: outcomeCount > 0 ? successCount / outcomeCount : 0,
      providerHitRates,
    };
  }

  /**
   * Export all records as JSON for external analysis.
   *
   * @returns JSON string of all records
   */
  export(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        recordCount: this.#records.length,
        stats: this.getStats(),
        records: this.#records,
      },
      null,
      2
    );
  }

  /**
   * Clear all telemetry records.
   */
  clear(): void {
    this.#records = [];
    this.#persistIfEnabled();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Add a record to the circular buffer.
   */
  #addRecord(record: TelemetryRecord): void {
    this.#records.push(record);

    // Maintain circular buffer - remove oldest if over capacity
    if (this.#records.length > this.#maxRecords) {
      this.#records.shift();
    }

    this.#persistIfEnabled();
  }

  /**
   * Persist records to disk if enabled.
   */
  #persistIfEnabled(): void {
    if (this.#persist && this.#storagePath) {
      this.#saveToDisk();
    }
  }

  /**
   * Save records to disk.
   */
  #saveToDisk(): void {
    if (!this.#storagePath) return;

    try {
      const dir = dirname(this.#storagePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const data = JSON.stringify(this.#records, null, 2);
      writeFileSync(this.#storagePath, data, "utf-8");
    } catch {
      // Silently ignore persistence errors - telemetry should not break the system
    }
  }

  /**
   * Load records from disk.
   */
  #loadFromDisk(): void {
    if (!this.#storagePath) return;

    try {
      if (existsSync(this.#storagePath)) {
        const data = readFileSync(this.#storagePath, "utf-8");
        const parsed = JSON.parse(data) as unknown;

        if (Array.isArray(parsed)) {
          // Validate and filter records
          this.#records = parsed.filter(
            (r): r is TelemetryRecord =>
              typeof r === "object" &&
              r !== null &&
              typeof (r as TelemetryRecord).sessionId === "string" &&
              typeof (r as TelemetryRecord).timestamp === "number" &&
              typeof (r as TelemetryRecord).data === "object"
          );

          // Trim to max records if loaded more
          if (this.#records.length > this.#maxRecords) {
            this.#records = this.#records.slice(-this.#maxRecords);
          }
        }
      }
    } catch {
      // Start fresh if loading fails
      this.#records = [];
    }
  }

  /**
   * Estimate tokens used from telemetry (heuristic).
   * Real implementation would track actual tokens.
   */
  #estimateTokensUsed(data: EvidenceTelemetry): number {
    // Simple heuristic: evidence count * average tokens per evidence item
    const AVG_TOKENS_PER_EVIDENCE = 150;
    return data.evidenceCountAfterBudget * AVG_TOKENS_PER_EVIDENCE;
  }
}
