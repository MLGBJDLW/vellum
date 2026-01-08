interface ServerFailure {
  serverId: string;
  error: Error;
  timestamp: number;
  attemptCount: number;
}

interface BrokenTrackerConfig {
  maxRetries: number;
  retryBaseMs: number;
  maxRetryMs: number;
  disableDurationMs: number;
}

export class BrokenServerTracker {
  private failures = new Map<string, ServerFailure>();
  private disabled = new Set<string>();
  private config: BrokenTrackerConfig;

  constructor(config: Partial<BrokenTrackerConfig> = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 5,
      retryBaseMs: config.retryBaseMs ?? 1000,
      maxRetryMs: config.maxRetryMs ?? 60_000,
      disableDurationMs: config.disableDurationMs ?? 30 * 60 * 1000,
    };
  }

  recordFailure(serverId: string, error: Error): void {
    const existing = this.failures.get(serverId);
    const attemptCount = (existing?.attemptCount ?? 0) + 1;

    this.failures.set(serverId, {
      serverId,
      error,
      timestamp: Date.now(),
      attemptCount,
    });

    if (attemptCount >= this.config.maxRetries) {
      this.disabled.add(serverId);

      setTimeout(() => {
        this.disabled.delete(serverId);
        this.failures.delete(serverId);
      }, this.config.disableDurationMs);
    }
  }

  recordSuccess(serverId: string): void {
    this.failures.delete(serverId);
  }

  isAvailable(serverId: string): boolean {
    return !this.disabled.has(serverId);
  }

  getRetryDelay(serverId: string): number {
    const failure = this.failures.get(serverId);
    if (!failure) return 0;

    return Math.min(
      this.config.retryBaseMs * 2 ** (failure.attemptCount - 1),
      this.config.maxRetryMs
    );
  }

  getDisabledServers(): string[] {
    return Array.from(this.disabled);
  }

  getFailureInfo(serverId: string): ServerFailure | undefined {
    return this.failures.get(serverId);
  }

  forceEnable(serverId: string): void {
    this.disabled.delete(serverId);
    this.failures.delete(serverId);
  }
}
