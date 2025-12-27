# Logging & Telemetry

> Structured logging, OpenTelemetry tracing, and privacy-first data handling for Vellum.

## Quick Start

### Basic Logger

```typescript
import { createLogger } from '@vellum/core';

const logger = createLogger({ 
  name: 'my-app',
  level: 'debug' 
});

logger.info('Application started');
logger.debug('Debug info', { userId: '123' });
logger.error('Something failed', { error: err });
```

### Timer for Performance Tracking

```typescript
const timer = logger.time('database-query');

// ... perform operation ...

timer.end('Query completed'); // Logs duration
// Or: const ms = timer.stop(); // Returns ms without logging
```

### LLM Request Logging

```typescript
import { LLMLogger, createLogger } from '@vellum/core';

const logger = createLogger({ name: 'llm' });
const llmLogger = new LLMLogger(logger);

const requestId = crypto.randomUUID();
llmLogger.logRequestStart('anthropic', 'claude-3-opus', requestId);

// ... make LLM call ...

llmLogger.logRequestComplete({
  provider: 'anthropic',
  model: 'claude-3-opus',
  requestId,
  inputTokens: 100,
  outputTokens: 500,
  durationMs: 1234,
});
```

---

## OpenTelemetry Integration

### Setup

```typescript
import { setupTelemetry, createTelemetryConfigFromEnv } from '@vellum/core';

// From environment variables
setupTelemetry(createTelemetryConfigFromEnv());

// Or explicit config
setupTelemetry({
  enabled: true,
  serviceName: 'vellum',
  exporterType: 'otlp',
  otlpEndpoint: 'http://localhost:4318/v1/traces',
  samplingRatio: 0.1,
});
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VELLUM_TELEMETRY_ENABLED` | Enable/disable telemetry | `false` |
| `VELLUM_TELEMETRY_EXPORTER` | `console`, `otlp`, or `none` | `console` |
| `VELLUM_TELEMETRY_SAMPLING_RATIO` | Sampling ratio (0.0-1.0) | `1.0` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint URL | - |
| `OTEL_SERVICE_NAME` | Service name for traces | `vellum` |

### Instrumenting LLM Calls

```typescript
import { TelemetryInstrumentor } from '@vellum/core';

const instrumentor = new TelemetryInstrumentor();

const result = await instrumentor.instrument(
  { provider: 'openai', model: 'gpt-4', requestId: '123', operation: 'chat' },
  async () => {
    return await openai.chat.completions.create({ ... });
  }
);
```

### Streaming Instrumentation

```typescript
const stream = instrumentor.instrumentStream(
  { provider: 'anthropic', model: 'claude-3', requestId: '456', operation: 'chat' },
  anthropic.messages.stream({ ... })
);

for await (const chunk of stream) {
  // Process chunks - span stays open until stream ends
}
```

---

## Privacy Filtering

### Filter Sensitive Data

```typescript
import { PrivacyFilter } from '@vellum/core';

const filter = new PrivacyFilter();

// Filter strings
filter.filterString('API key: sk-ant-abc123xyz');
// → 'API key: [ANTHROPIC_KEY_REDACTED]'

// Filter objects recursively
filter.filterObject({
  user: 'john',
  password: 'secret123',
  nested: { apiKey: 'sk-xyz' }
});
// → { user: 'john', password: '[REDACTED]', nested: { apiKey: '[REDACTED]' } }
```

### Telemetry Sanitization

```typescript
import { TelemetrySanitizer } from '@vellum/core';

const sanitizer = new TelemetrySanitizer();

sanitizer.sanitizeAttributes({
  'gen_ai.model': 'gpt-4',
  'gen_ai.prompt': 'User message...',  // Removed
  'gen_ai.response': 'AI response...',  // Removed
});
// → { 'gen_ai.model': 'gpt-4' }
```

---

## Metrics

### Counters

```typescript
import { MetricsCollector } from '@vellum/core';

const metrics = MetricsCollector.getInstance();
const requestCounter = metrics.createCounter({ name: 'requests_total' });

requestCounter.inc({ endpoint: '/api/chat' });
requestCounter.get({ endpoint: '/api/chat' }); // → 1
```

### Histograms

```typescript
const latency = metrics.createHistogram({ name: 'request_duration_ms' });

latency.observe(150);
latency.observe(200);
latency.observe(180);

latency.getStats();
// → { count: 3, sum: 530, min: 150, max: 200, avg: 176.67, p50: 180, p90: 200, p99: 200 }
```

### Pre-built Vellum Metrics

```typescript
import { 
  llmRequestsTotal, 
  promptTokensTotal, 
  llmRequestDuration 
} from '@vellum/core';

llmRequestsTotal.inc({ provider: 'anthropic', model: 'claude-3' });
promptTokensTotal.inc({}, 100);
llmRequestDuration.observe(1234);
```

---

## File Rotation

```typescript
import { RotatingFileTransport } from '@vellum/core';

const transport = new RotatingFileTransport({
  filepath: '/var/log/vellum/app.log',
  maxSize: 10 * 1024 * 1024,  // 10MB
  maxFiles: 5,
  compress: true,  // gzip old files
});

transport.write({ level: 'info', message: 'Hello', timestamp: Date.now() });
```

---

## Configuration

### Environment-Aware Defaults

```typescript
import { getLoggingConfig } from '@vellum/core';

const config = getLoggingConfig(); // Uses NODE_ENV

// Development: debug level, colors, no telemetry
// Production: info level, JSON output, 10% sampling
```

### Native SDK Telemetry Integration

Vellum uses Native SDKs directly. Telemetry is collected at the provider level:

```typescript
import { telemetryCollector } from '@vellum/core/telemetry';

// Record LLM call
await telemetryCollector.recordLLMCall({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  inputTokens: 1500,
  outputTokens: 500,
  latencyMs: 2340,
  success: true,
});
```

> **Note**: Vellum does not use Vercel AI SDK (`ai` package). All telemetry is collected through native provider integrations.

---

## API Reference

### Logger

| Method | Description |
|--------|-------------|
| `trace(msg, ctx?)` | Trace level (most verbose) |
| `debug(msg, ctx?)` | Debug level |
| `info(msg, ctx?)` | Info level |
| `warn(msg, ctx?)` | Warning level |
| `error(msg, ctx?)` | Error level |
| `fatal(msg, ctx?)` | Fatal level (least verbose) |
| `time(label)` | Start timer, returns `TimerResult` |
| `child(name)` | Create child logger with prefix |

### TimerResult

| Method | Description |
|--------|-------------|
| `end(msg?)` | Log duration and optional message |
| `stop()` | Return duration in ms without logging |
| `duration` | Current elapsed time in ms |
