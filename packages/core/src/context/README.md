# Context Management System

> Intelligent context window management for LLM interactions.

## Overview

The Context Management System automatically manages conversation history to stay within model context limits while preserving important information. It provides:

- **Token Budget Calculation** - Model-aware output reserves
- **Priority-Based Truncation** - Remove low-priority messages first
- **Tool Pair Preservation** - Never split tool_use/tool_result
- **LLM Compression** - Summarize old messages with 6-section format
- **Checkpoint/Rollback** - Recover from aggressive operations
- **Provider-Specific Image Tokens** - Accurate image token calculation
- **Growth Validation** - Prevent compression from increasing context
- **Multi-Model Fallback** - Resilient summarization with automatic failover
- **DeepSeek Reasoning Support** - Synthetic thinking blocks for CoT models

## Quick Start

```typescript
import {
  AutoContextManager,
  createDefaultConfig,
  getEffectiveApiHistory,
  type ContextMessage,
} from '@vellum/core';

// Initialize with model and optional LLM client for compression
const manager = new AutoContextManager({
  model: 'claude-sonnet-4-20250514',
  llmClient: myLLMClient, // Optional: enables compression
});

// Manage context before API calls
const result = await manager.manage(messages);

console.log(result.state);    // 'healthy' | 'warning' | 'critical' | 'overflow'
console.log(result.actions);  // ['pruned 3 tool outputs', 'truncated 5 messages']

// Get API-safe history (excludes compressed originals)
const apiHistory = getEffectiveApiHistory(result.messages);
```

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    AutoContextManager                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Token Budget │  │ Threshold   │  │ Checkpoint Manager │  │
│  │ Calculator   │  │ Config      │  │ (LRU)              │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    manage() Flow                      │   │
│  │  1. Calculate tokens → 2. Determine state →           │   │
│  │  3. Execute actions (prune/truncate/compress)         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## State Machine

| State | Usage % | Actions |
|-------|---------|---------|
| healthy | 0-75% | None |
| warning | 75-85% | Prune tool outputs |
| critical | 85-95% | Truncate + Compress |
| overflow | 95%+ | Emergency recovery |

## Configuration

```typescript
interface AutoContextManagerConfig {
  model: string;                    // Model identifier
  contextWindow?: number;           // Override context window
  llmClient?: CompressionLLMClient; // For compression
  useAutoCondense?: boolean;        // Enable compression (default: true)
  thresholds?: ThresholdConfig;     // Custom thresholds
  maxToolOutputChars?: number;      // Prune limit (default: 10000)
  protectedTools?: string[];        // Never prune (default: ['skill', 'memory_search'])
  maxCheckpoints?: number;          // LRU limit (default: 5)
  recentCount?: number;             // Recent messages to protect (default: 3)
}
```

## Priority System

Messages are assigned priorities for truncation:

| Priority | Value | Description |
|----------|-------|-------------|
| SYSTEM | 100 | System prompts - never removed |
| ANCHOR | 90 | First user message |
| RECENT | 80 | Last N messages |
| TOOL_PAIR | 70 | Tool use/result pairs |
| NORMAL | 30 | Standard messages |

## API Reference

### AutoContextManager

Main entry point for context management.

```typescript
class AutoContextManager {
  constructor(config: AutoContextManagerConfig);
  
  manage(messages: ContextMessage[]): Promise<ManageResult>;
  calculateState(tokenCount: number): ContextState;
  getRecoveryStrategy(messages: ContextMessage[]): RecoveryStrategy;
  createCheckpoint(messages: ContextMessage[], label?: string): string;
  rollbackToCheckpoint(id: string, messages: ContextMessage[]): ContextMessage[];
}
```

### Token Budget

```typescript
function calculateTokenBudget(options: {
  contextWindow: number;
  outputReserve?: number;
  systemReserve?: number;
}): TokenBudget;

function calculateOutputReserve(contextWindow: number): number;
```

### Compression

```typescript
class NonDestructiveCompressor {
  compress(messages: ContextMessage[], range?: { start: number; end: number }): Promise<CompressionResult>;
}

function isSummaryMessage(message: ContextMessage): boolean;
function getCompressedMessages(messages: ContextMessage[], condenseId: string): ContextMessage[];
```

### Checkpoints

```typescript
class CheckpointManager {
  create(messages: ContextMessage[], options?: { label?: string }): Checkpoint;
  rollback(id: string, currentMessages: ContextMessage[]): RollbackResult;
  list(): Checkpoint[];
}
```

### ContextGrowthValidator

Validates that LLM-generated summaries are smaller than the original content, preventing context explosion.

```typescript
import { ContextGrowthValidator, validateGrowth } from '@vellum/core';

// Class-based usage
const validator = new ContextGrowthValidator({
  maxAllowedRatio: 1.0,   // Summary must be smaller than original
  throwOnFailure: true,   // Throw CompactionError on growth
});

const result = validator.validate(1000, 300);
// => { isValid: true, ratio: 0.3, tokensSaved: 700 }

// Throws CompactionError (CONTEXT_GROWTH) if summary is larger
validator.validate(1000, 1200); // Error!

// Quick validation function
const quick = validateGrowth(1000, 300);
```

### ReasoningBlockHandler

Handles synthetic reasoning blocks for models that require explicit chain-of-thought (CoT), such as DeepSeek R1.

```typescript
import { ReasoningBlockHandler, requiresReasoningBlock } from '@vellum/core';

// Check if model needs reasoning blocks
if (requiresReasoningBlock('deepseek-r1')) {
  const handler = new ReasoningBlockHandler({
    thinkingPrefix: 'Let me analyze the context...',
    includeTimestamp: false,
  });

  const result = handler.addReasoningBlock(summaryMessage);
  // result.message.reasoningContent contains <thinking>...</thinking>
}

// Process message for specific model
const result = handler.processForModel(message, 'deepseek-r1');
```

**Supported Models:**

- `deepseek-r1`, `deepseek-v3`, `deepseek-coder`
- Any model matching `/deepseek/i` pattern

### FallbackChain

Multi-model fallback chain for resilient summarization. Tries models in order with automatic failover.

```typescript
import { FallbackChain, createFallbackChain } from '@vellum/core';

const chain = new FallbackChain({
  models: [
    { model: 'gpt-4o', timeout: 30000, maxRetries: 2 },
    { model: 'claude-3-haiku', timeout: 20000 },
    { model: 'gemini-flash', timeout: 15000 },
  ],
  createClient: (model) => createLLMClient(model),
  onFallback: (from, to) => console.log(`Falling back: ${from} -> ${to}`),
});

try {
  const result = await chain.summarize(messages, prompt);
  console.log(`Success: ${result.model}, attempts: ${result.attempts}`);
} catch (err) {
  // CompactionError with code ALL_MODELS_FAILED
}
```

**Features:**

- Per-model timeout and retry configuration
- Progressive backoff between retries
- Detailed attempt history for observability
- Callbacks for monitoring fallbacks

### CompactionError

Specialized error class for compaction-related failures with typed error codes.

```typescript
import { CompactionError, CompactionErrorCode } from '@vellum/core';

// Error codes
CompactionErrorCode.INVALID_SUMMARY    // Summary failed quality checks
CompactionErrorCode.CONTEXT_GROWTH     // Summary larger than original
CompactionErrorCode.ALL_MODELS_FAILED  // All fallback models exhausted
CompactionErrorCode.NO_TOKEN_BUDGET    // Insufficient token budget
CompactionErrorCode.MIN_MESSAGES_NOT_MET // Not enough messages

// Static factory methods
throw CompactionError.invalidSummary('Missing key info', { model: 'gpt-4o' });
throw CompactionError.contextGrowth('Summary grew', {
  originalTokens: 1000,
  resultingTokens: 1200,
});

// Type checking
if (CompactionError.isCompactionError(error)) {
  console.log(error.code, error.isRetryable);
}
```

**Error Properties:**

- `code` — Typed error code
- `isRetryable` — Whether retry may help
- `model` — Model that failed (if applicable)
- `originalTokens`, `resultingTokens` — For growth errors

## Profile Thresholds & Configuration

### Profile-Specific Thresholds

Models use different threshold profiles based on their characteristics:

| Profile | autoCondensePercent | Warning | Critical | Overflow | Use Case |
|---------|---------------------|---------|----------|----------|----------|
| conservative | 75% | 70% | 80% | 90% | High-quality models (Claude Opus) |
| balanced | 80% | 75% | 85% | 95% | General purpose (GPT-4o, Claude Sonnet) |
| aggressive | 85% | 85% | 92% | 97% | Large context models (DeepSeek, Gemini) |

The `autoCondensePercent` threshold triggers automatic summarization when context usage exceeds this percentage.

### Protected Tools Configuration

Certain tools should never have their outputs pruned during compression:

```typescript
const manager = new AutoContextManager({
  model: 'claude-sonnet-4-20250514',
  protectedTools: ['skill', 'memory_search', 'read_file'],
});
```

**Default Protected Tools:**

- `skill` — Skill execution results
- `memory_search` — Memory search results

## Model-Specific Thresholds

| Model | Profile | Warning | Critical | Overflow |
|-------|---------|---------|----------|----------|
| claude-3-opus | conservative | 70% | 80% | 90% |
| deepseek-* | aggressive | 85% | 92% | 97% |
| gpt-4o | balanced | 75% | 85% | 95% |
| gemini-* | aggressive | 88% | 94% | 98% |

## Image Token Calculation

Provider-specific calculations:

| Provider | Formula |
|----------|---------|
| Anthropic | ceil(width × height / 750) |
| OpenAI (high) | 85 + tiles × 170 |
| OpenAI (low) | 85 |
| Gemini | 258 fixed |

```typescript
const calc = createImageCalculator('anthropic');
const tokens = calc.calculateTokens(imageBlock);
```

## Testing

```bash
# Run all context tests
pnpm test packages/core/src/context/

# Run with coverage
pnpm test --coverage packages/core/src/context/
```

## License

MIT
