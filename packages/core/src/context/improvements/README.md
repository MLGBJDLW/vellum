# Context Management Improvements Module

> `@vellum/core/context/improvements`

## Overview

This module addresses 6 critical issues identified in the expert evaluation report, improving the reliability and efficiency of the context management system.

### Resolved Issues

| Priority | Issue # | Description | Resolution Component |
|----------|---------|-------------|---------------------|
| P0 | 1 | Summary quality lacks validation | `SummaryQualityValidator` |
| P0 | 2 | Truncation operations are non-recoverable | `TruncationStateManager` |
| P1 | 1 | Cross-session context loss | `CrossSessionInheritanceResolver` |
| P1 | 2 | Summaries get cascade-compressed | `SummaryProtectionFilter` |
| P2 | 1 | Checkpoints only exist in memory | `DiskCheckpointPersistence` |
| P2 | 2 | Lack of compaction statistics tracking | `CompactionStatsTracker` |

### Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ContextImprovementsManager                             │
│                        (Unified Management Entry)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ P0-1: Quality    │  │ P0-2: Truncation │  │ P1-1: Inheritance│          │
│  │   Validator      │  │   Manager        │  │   Resolver       │          │
│  │                  │  │                  │  │                  │          │
│  │ • Rule validation│  │ • Snapshot store │  │ • Session persist│          │
│  │ • LLM deep valid │  │ • Compression    │  │ • Project accum  │          │
│  │ • Tech term keep │  │ • LRU eviction   │  │ • Inherit policy │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ P1-2: Protection │  │ P2-1: Disk       │  │ P2-2: Stats      │          │
│  │   Filter         │  │   Checkpoint     │  │   Tracker        │          │
│  │                  │  │                  │  │                  │          │
│  │ • Strategy filter│  │ • Crash recovery │  │ • History records│          │
│  │ • Weight scoring │  │ • Space mgmt     │  │ • Cascade detect │          │
│  │ • Cascade protect│  │ • Compressed stor│  │ • Persist stats  │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │      .vellum/ (Disk Storage)  │
                    │                               │
                    │  ├── checkpoints/             │
                    │  ├── inheritance/             │
                    │  └── compaction-stats.json    │
                    └───────────────────────────────┘
```

---

## Component Documentation

### 1. SummaryQualityValidator (P0-1)

**Purpose**: Validate summary quality to ensure critical information is not lost.

**Validation Methods**:

- **Rule Validation (Fast)**: Pattern matching to detect technical terms, code references, file paths
- **LLM Validation (Deep)**: Use language models to evaluate completeness, accuracy, actionability

**Configuration Options**:

```typescript
interface SummaryQualityConfig {
  enableRuleValidation: boolean;    // Enable rule validation (default: true)
  enableLLMValidation: boolean;     // Enable LLM validation (default: false)
  minTechTermRetention: number;     // Min technical term retention rate (default: 0.8)
  minCodeRefRetention: number;      // Min code reference retention rate (default: 0.9)
  maxCompressionRatio: number;      // Max compression ratio (default: 10)
}
```

**Usage Example**:

```typescript
import { SummaryQualityValidator } from '@vellum/core/context/improvements';

const validator = new SummaryQualityValidator({
  enableRuleValidation: true,
  minTechTermRetention: 0.85,
});

// Validate summary quality
const report = await validator.validate(originalMessages, summaryText);

if (!report.passed) {
  console.log('Summary quality failed:', report.warnings);
  console.log('Lost technical terms:', report.ruleResults?.lostItems);
}
```

---

### 2. TruncationStateManager (P0-2)

**Purpose**: Save snapshots before truncation to support content recovery.

**Features**:

- LRU eviction policy for memory management
- Optional zlib compression to reduce storage
- Automatic expiration cleanup

**Configuration Options**:

```typescript
interface TruncationRecoveryOptions {
  maxSnapshots: number;       // Max snapshots (default: 3)
  maxSnapshotSize: number;    // Max bytes per snapshot (default: 1MB)
  enableCompression: boolean; // Enable compression (default: true)
  expirationMs: number;       // Expiration time in ms (default: 30 minutes)
}
```

**Usage Example**:

```typescript
import { TruncationStateManager } from '@vellum/core/context/improvements';

const manager = new TruncationStateManager({
  maxSnapshots: 5,
  enableCompression: true,
});

// Save snapshot before truncation
const state = manager.saveSnapshot('trunc-1', messagesToTruncate, 'token_overflow');

// Recover when needed
const recovered = manager.recoverMessages(state.truncationId);
if (recovered) {
  console.log('Recovered', recovered.length, 'messages');
}
```

---

### 3. CrossSessionInheritanceResolver (P1-1)

**Purpose**: Inherit context across sessions to maintain knowledge continuity.

**Storage Structure**:

```text
.vellum/inheritance/
├── index.json              # Session index
├── session-{id}.json       # Session summaries
└── project-context.json    # Project-level context
```

**Configuration Options**:

```typescript
interface SessionInheritanceConfig {
  enabled: boolean;                          // Enable inheritance (default: true)
  source: 'last_session' | 'project_context' | 'manual';  // Inheritance source
  maxInheritedSummaries: number;            // Max inherited summaries (default: 3)
  inheritTypes: InheritanceContentType[];   // Content types to inherit
}

type InheritanceContentType = 'summary' | 'decisions' | 'code_state' | 'pending_tasks';
```

**Usage Example**:

```typescript
import { CrossSessionInheritanceResolver } from '@vellum/core/context/improvements';

const resolver = new CrossSessionInheritanceResolver({
  enabled: true,
  source: 'last_session',
  maxInheritedSummaries: 3,
  inheritTypes: ['summary', 'decisions'],
});

await resolver.initialize('/path/to/project');

// Save current session context
await resolver.saveSessionContext('session-123', summaries, { custom: 'metadata' });

// Inherit context when starting a new session
const inherited = await resolver.inheritFromLastSession();
if (inherited) {
  console.log('Inherited', inherited.summaries.length, 'summaries');
}
```

---

### 4. SummaryProtectionFilter (P1-2)

**Purpose**: Prevent summaries from cascade compression to avoid layer-by-layer information loss.

**Problem Scenario**:

```text
M1-M50  → Summary1  (may lose details)
M51-M90 → Summary2
Summary1 + Summary2 → Summary3  ← M1-M50 details permanently lost!
```

**Protection Strategies**:

- `all`: Protect all summaries
- `recent`: Only protect the most recent N summaries
- `weighted`: Protect based on importance scoring

**Configuration Options**:

```typescript
interface SummaryProtectionConfig {
  enabled: boolean;                              // Enable protection (default: true)
  maxProtectedSummaries: number;                 // Max protected count (default: 5)
  strategy: 'all' | 'recent' | 'weighted';       // Protection strategy (default: 'recent')
}
```

**Usage Example**:

```typescript
import { SummaryProtectionFilter } from '@vellum/core/context/improvements';

const filter = new SummaryProtectionFilter({
  enabled: true,
  maxProtectedSummaries: 5,
  strategy: 'recent',
});

// Get protected summary IDs
const protectedIds = filter.getProtectedIds(allMessages);

// Filter compression candidate messages
const safeCandidates = filter.filterCandidates(candidates, allMessages);
// safeCandidates does not contain any protected summaries
```

---

### 5. DiskCheckpointPersistence (P2-1)

**Purpose**: Persist checkpoints to disk to support crash recovery.

**Storage Structure**:

```text
.vellum/checkpoints/
├── manifest.json           # Checkpoint manifest
├── cp-xxx.checkpoint       # Checkpoint file
└── cp-yyy.checkpoint.gz    # Compressed checkpoint
```

**Persistence Strategies**:

- `immediate`: Write immediately after creation
- `lazy`: Write during the next idle cycle
- `on_demand`: Write only when explicitly requested

**Configuration Options**:

```typescript
interface DiskCheckpointConfig {
  enabled: boolean;                                      // Enable (default: false)
  directory: string;                                     // Storage directory
  maxDiskUsage: number;                                  // Max disk usage (default: 100MB)
  strategy: 'immediate' | 'lazy' | 'on_demand';          // Persistence strategy
  enableCompression: boolean;                            // Enable compression (default: true)
}
```

**Usage Example**:

```typescript
import { DiskCheckpointPersistence } from '@vellum/core/context/improvements';

const persistence = new DiskCheckpointPersistence({
  enabled: true,
  directory: '.vellum/checkpoints',
  maxDiskUsage: 50 * 1024 * 1024, // 50MB
  strategy: 'lazy',
});

await persistence.initialize();

// Persist checkpoint
await persistence.persist('checkpoint-1', messages);

// Restore checkpoint
const restored = await persistence.restore('checkpoint-1');

// Clean up old checkpoints
await persistence.cleanup();
```

---

### 6. CompactionStatsTracker (P2-2)

**Purpose**: Track compaction statistics and detect cascade compaction.

**Tracked Metrics**:

- Total compaction count
- Cascade compaction count
- Token savings
- Quality report history

**Configuration Options**:

```typescript
interface CompactionStatsConfig {
  enabled: boolean;         // Enable tracking (default: true)
  persist: boolean;         // Persist to disk (default: true)
  maxHistoryEntries: number; // Max history entries (default: 100)
  statsFilePath?: string;   // Statistics file path
}
```

**Usage Example**:

```typescript
import { CompactionStatsTracker } from '@vellum/core/context/improvements';

const tracker = new CompactionStatsTracker({
  enabled: true,
  persist: true,
  maxHistoryEntries: 100,
});

await tracker.initialize('session-123');

// Record a compaction
await tracker.record({
  timestamp: Date.now(),
  originalTokens: 5000,
  compressedTokens: 1000,
  messageCount: 20,
  isCascade: false,
});

// Get statistics
const stats = tracker.getStats();
console.log(`Compaction efficiency: ${((1 - stats.totalCompressedTokens / stats.totalOriginalTokens) * 100).toFixed(1)}%`);
console.log(`Cascade compactions: ${stats.cascadeCompactions}`);
```

---

### 7. ContextImprovementsManager (Unified Management)

**Purpose**: Unified management of all improvement components, providing centralized configuration and lifecycle management.

**Features**:

- Centralized configuration management
- Lazy-loaded component instances
- Unified initialization/shutdown
- Convenient accessor methods

**Usage Example**:

```typescript
import { 
  ContextImprovementsManager, 
  DEFAULT_IMPROVEMENTS_CONFIG 
} from '@vellum/core/context/improvements';

// Create manager (partial config, rest uses defaults)
const manager = new ContextImprovementsManager({
  summaryQuality: {
    ...DEFAULT_IMPROVEMENTS_CONFIG.summaryQuality,
    enableLLMValidation: true,
  },
  compactionStats: {
    enabled: true,
    persist: true,
  },
});

// Initialize all components
await manager.initialize();

// Use components through accessors
const report = await manager.qualityValidator.validate(messages, summary);
const stats = manager.statsTracker.getStats();
const protected = manager.summaryProtection.getProtectedIds(messages);

// Cleanup on shutdown
await manager.shutdown();
```

---

## Configuration Guide

### Default Configuration

The system provides conservative production-safe defaults:

```typescript
import { DEFAULT_IMPROVEMENTS_CONFIG } from '@vellum/core/context/improvements';

// Default configuration characteristics:
// - LLM validation disabled by default (cost consideration)
// - Disk checkpoints disabled by default
// - Reasonable memory and storage limits
```

### Recommended Configurations

#### Development Environment

```typescript
const devConfig = {
  summaryQuality: {
    enableRuleValidation: true,
    enableLLMValidation: false,  // No need for LLM validation during development
    minTechTermRetention: 0.7,   // Relaxed threshold
    minCodeRefRetention: 0.8,
    maxCompressionRatio: 15,
  },
  truncationRecovery: {
    maxSnapshots: 5,             // More snapshots for debugging
    maxSnapshotSize: 2 * 1024 * 1024,
    enableCompression: false,    // Easier to inspect content
    expirationMs: 60 * 60 * 1000, // 1 hour
  },
  compactionStats: {
    enabled: true,
    persist: true,
    maxHistoryEntries: 200,      // More history
  },
};
```

#### Production Environment

```typescript
const prodConfig = {
  summaryQuality: {
    enableRuleValidation: true,
    enableLLMValidation: true,   // Enable deep validation
    minTechTermRetention: 0.85,  // Stricter threshold
    minCodeRefRetention: 0.95,
    maxCompressionRatio: 8,
  },
  truncationRecovery: {
    maxSnapshots: 3,
    maxSnapshotSize: 1024 * 1024,
    enableCompression: true,
    expirationMs: 15 * 60 * 1000, // 15 minutes
  },
  diskCheckpoint: {
    enabled: true,               // Enable crash recovery
    directory: '.vellum/checkpoints',
    maxDiskUsage: 100 * 1024 * 1024,
    strategy: 'lazy',
    enableCompression: true,
  },
};
```

### Advanced Configuration Options

#### Custom LLM Validation Client

```typescript
import type { QualityValidationLLMClient } from '@vellum/core/context/improvements';

const customLLMClient: QualityValidationLLMClient = {
  async validateSummary(original, summary) {
    // Custom LLM call logic
    const response = await myLLMProvider.complete({
      prompt: `Evaluate summary quality...\nOriginal: ${original}\nSummary: ${summary}`,
    });
    return {
      completenessScore: 8,
      accuracyScore: 9,
      actionabilityScore: 7,
      suggestions: ['Recommend retaining more code examples'],
    };
  },
};

const validator = new SummaryQualityValidator(
  { enableLLMValidation: true },
  customLLMClient
);
```

#### Custom Inheritance Storage Directory

```typescript
const resolver = new CrossSessionInheritanceResolver({
  enabled: true,
  source: 'project_context',
  maxInheritedSummaries: 5,
  inheritTypes: ['summary', 'decisions', 'code_state'],
});

// Initialize with custom directory
await resolver.initialize('/custom/project/path', '/custom/storage/path');
```

---

## Migration Guide

### Migrating from Previous Versions

If you were previously using ContextWindowManager directly, you can now integrate improvement components:

**Before**:

```typescript
const contextManager = new ContextWindowManager(config);
// No summary validation
// No truncation recovery
// No cross-session inheritance
```

**After**:

```typescript
import { ContextImprovementsManager } from '@vellum/core/context/improvements';

// Create improvements manager
const improvements = new ContextImprovementsManager({
  summaryQuality: { enableRuleValidation: true },
  sessionInheritance: { enabled: true },
});

await improvements.initialize();

// Validate before compaction
const report = await improvements.qualityValidator.validate(messages, summary);
if (!report.passed) {
  // Handle quality issues
}

// Save snapshot before truncation
improvements.truncationManager.saveSnapshot('id', messages, 'token_overflow');
```

### Backward Compatibility

- All new components are disabled by default or use conservative configuration
- Does not affect existing ContextWindowManager behavior
- Components can be enabled incrementally

### Data Migration

The new version automatically creates required storage directories:

```text
.vellum/
├── checkpoints/         # Checkpoint storage (P2-1)
├── inheritance/         # Inheritance data (P1-1)
└── compaction-stats.json # Compaction statistics (P2-2)
```

---

## Troubleshooting

### Common Issues

#### Q1: Summary validation always fails

**Symptoms**: `report.passed` is always `false`

**Possible Causes**:

1. Threshold set too high
2. Summary over-compressed

**Solution**:

```typescript
// Check which specific rules failed
const report = await validator.validate(messages, summary);
console.log('Tech term retention rate:', report.ruleResults?.techTermRetention);
console.log('Code reference retention rate:', report.ruleResults?.codeRefRetention);
console.log('Lost items:', report.ruleResults?.lostItems);

// Adjust thresholds appropriately
const validator = new SummaryQualityValidator({
  minTechTermRetention: 0.7,  // Lower threshold
  minCodeRefRetention: 0.8,
});
```

#### Q2: Disk space growing too fast

**Symptoms**: `.vellum/` directory keeps growing in size

**Solution**:

```typescript
// 1. Reduce checkpoint retention
const diskCheckpoint = new DiskCheckpointPersistence({
  maxDiskUsage: 50 * 1024 * 1024,  // Limit to 50MB
});

// 2. Manual cleanup
await diskCheckpoint.cleanup();

// 3. Reduce history entries
const statsTracker = new CompactionStatsTracker({
  maxHistoryEntries: 50,  // Reduce history
});
```

#### Q3: Cross-session inheritance not working

**Symptoms**: New sessions don't inherit context from the previous session

**Troubleshooting Steps**:

```typescript
// 1. Check if saved correctly
await resolver.saveSessionContext(sessionId, summaries);

// 2. Check index file
// View .vellum/inheritance/index.json

// 3. Check session file
// View .vellum/inheritance/session-{id}.json

// 4. Check inheritance call
const inherited = await resolver.inheritFromLastSession();
console.log('Inheritance result:', inherited);
```

### Log Analysis

Enable debug logging:

```typescript
// Set environment variable
process.env.DEBUG = 'vellum:context-improvements-manager,vellum:summary-quality-validator';

// Or use Vellum logger configuration
import { setLogLevel } from '@vellum/core/logger';
setLogLevel('debug');
```

**Common Log Patterns**:

```text
[context-improvements-manager] Component initialization complete
[summary-quality-validator] Rule validation: techTermRetention=0.82, codeRefRetention=0.91
[truncation-state-manager] Saving snapshot: id=trunc-1, size=524288, compressed=true
[cross-session-inheritance] Inheriting context: sessionId=session-123, summaries=3
```

---

## API Reference

See [types.ts](./types.ts) for complete type definitions.

Main exported interfaces:

```typescript
// Components
export { SummaryQualityValidator } from './summary-quality-validator';
export { TruncationStateManager } from './truncation-state-manager';
export { CrossSessionInheritanceResolver } from './cross-session-inheritance';
export { SummaryProtectionFilter } from './summary-protection-filter';
export { DiskCheckpointPersistence } from './disk-checkpoint-persistence';
export { CompactionStatsTracker } from './compaction-stats-tracker';
export { ContextImprovementsManager } from './manager';

// Configuration Types
export type { SummaryQualityConfig } from './types';
export type { TruncationRecoveryOptions } from './types';
export type { SessionInheritanceConfig } from './types';
export type { SummaryProtectionConfig } from './types';
export type { DiskCheckpointConfig } from './types';
export type { CompactionStatsConfig } from './types';
export type { ContextImprovementsConfig } from './types';

// Default Configuration
export { DEFAULT_IMPROVEMENTS_CONFIG } from './types';
```
