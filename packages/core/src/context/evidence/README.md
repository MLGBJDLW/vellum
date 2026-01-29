# Evidence Pack System

Intelligent context builder for AI coding assistants.

## Quick Start

```typescript
import { EvidencePackSystem, AdaptiveEvidenceSystem } from '@vellum/core';

// Basic usage
const system = new EvidencePackSystem({
  workspaceRoot: '/path/to/project',
  tokenBudget: 8000,
});

const pack = await system.build({
  input: 'fix the TypeError in user.ts',
  workingSet: ['src/user.ts'],
});

// Adaptive usage with intent detection
const adaptive = new AdaptiveEvidenceSystem({
  workspaceRoot: '/path/to/project',
  enableIntentAdaptation: true,
  enableWeightOptimization: true,
});

const result = await adaptive.build('implement user authentication');
console.log(result.intent); // { intent: 'implement', confidence: 0.8 }
```

## Architecture

```
Signal → Provider → Rerank → Budget → Pack
  ↓         ↓          ↓        ↓       ↓
Extract   Query    Score   Allocate  Assemble
```

## Components

| Component | Purpose |
|-----------|---------|
| SignalExtractor | Extract symbols, paths, errors from input |
| Providers | DiffProvider, SearchProvider, LspProvider |
| Reranker | Multi-feature scoring |
| BudgetAllocator | Token budget per provider |
| PackBuilder | Assemble final Evidence Pack |

## Adaptive Features

- **TaskIntentClassifier**: Detect debug/implement/refactor/explore intents
- **IntentAwareProviderStrategy**: Adjust weights by task type
- **WeightOptimizer**: Learn from success/failure feedback

## Module Structure

```
evidence/
├── index.ts              # Public API exports
├── types.ts              # Core type definitions
├── signal-extractor.ts   # Input signal extraction
├── budget-allocator.ts   # Token budget allocation
├── reranker.ts           # Evidence scoring
├── pack-builder.ts       # Pack assembly
├── evidence-cache.ts     # Caching layer
├── telemetry.ts          # Performance metrics
├── system.ts             # Main orchestrator
├── adaptive/             # Adaptive features
│   ├── index.ts
│   ├── intent-classifier.ts
│   ├── provider-strategy.ts
│   └── weight-optimizer.ts
└── providers/            # Evidence providers
    ├── index.ts
    ├── base.ts
    ├── diff.ts
    ├── search.ts
    └── lsp.ts
```

## Configuration

```typescript
interface EvidencePackConfig {
  workspaceRoot: string;
  tokenBudget?: number;        // Default: 8000
  maxEvidenceItems?: number;   // Default: 50
  enableCache?: boolean;       // Default: true
  cacheTTL?: number;           // Default: 300000 (5 min)
  providers?: ProviderType[];  // Default: all
}
```

## Telemetry

The system collects performance metrics:

```typescript
interface EvidenceTelemetry {
  totalDurationMs: number;
  signalExtractionMs: number;
  providerQueryMs: number;
  rerankingMs: number;
  budgetAllocationMs: number;
  packBuildMs: number;
  cacheHitRate: number;
  evidenceCount: number;
  tokenCount: number;
}
```
