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
```markdown

## Architecture

```
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
```markdown

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
```markdown

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
```markdown

### Token Budget

```typescript
function calculateTokenBudget(options: {
  contextWindow: number;
  outputReserve?: number;
  systemReserve?: number;
}): TokenBudget;

function calculateOutputReserve(contextWindow: number): number;
```markdown

### Compression

```typescript
class NonDestructiveCompressor {
  compress(messages: ContextMessage[], range?: { start: number; end: number }): Promise<CompressionResult>;
}

function isSummaryMessage(message: ContextMessage): boolean;
function getCompressedMessages(messages: ContextMessage[], condenseId: string): ContextMessage[];
```markdown

### Checkpoints

```typescript
class CheckpointManager {
  create(messages: ContextMessage[], options?: { label?: string }): Checkpoint;
  rollback(id: string, currentMessages: ContextMessage[]): RollbackResult;
  list(): Checkpoint[];
}
```markdown

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
```markdown

## Testing

```bash
# Run all context tests
pnpm test packages/core/src/context/

# Run with coverage
pnpm test --coverage packages/core/src/context/
```

## License

MIT
