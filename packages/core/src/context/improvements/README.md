# 上下文管理改进模块

> `@vellum/core/context/improvements`

## 概述

本模块解决了专家评估报告中识别的 6 个关键问题，提升上下文管理系统的可靠性和效率。

### 解决的问题

| 优先级 | 问题编号 | 问题描述 | 解决组件 |
|--------|----------|----------|----------|
| P0 | 1 | 摘要质量缺乏验证 | `SummaryQualityValidator` |
| P0 | 2 | 截断操作不可恢复 | `TruncationStateManager` |
| P1 | 1 | 跨会话上下文丢失 | `CrossSessionInheritanceResolver` |
| P1 | 2 | 摘要被级联压缩 | `SummaryProtectionFilter` |
| P2 | 1 | 检查点仅存于内存 | `DiskCheckpointPersistence` |
| P2 | 2 | 缺乏压缩统计追踪 | `CompactionStatsTracker` |

### 架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ContextImprovementsManager                             │
│                         (统一管理入口)                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ P0-1: Quality    │  │ P0-2: Truncation │  │ P1-1: Inheritance│          │
│  │   Validator      │  │   Manager        │  │   Resolver       │          │
│  │                  │  │                  │  │                  │          │
│  │ ・规则验证        │  │ ・快照存储        │  │ ・会话持久化      │          │
│  │ ・LLM 深度验证    │  │ ・压缩支持        │  │ ・项目级累积      │          │
│  │ ・技术术语保留    │  │ ・LRU 淘汰        │  │ ・继承策略        │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ P1-2: Protection │  │ P2-1: Disk       │  │ P2-2: Stats      │          │
│  │   Filter         │  │   Checkpoint     │  │   Tracker        │          │
│  │                  │  │                  │  │                  │          │
│  │ ・策略过滤        │  │ ・崩溃恢复        │  │ ・历史记录        │          │
│  │ ・权重评分        │  │ ・空间管理        │  │ ・级联检测        │          │
│  │ ・级联防护        │  │ ・压缩存储        │  │ ・持久化统计      │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │      .vellum/ (磁盘存储)       │
                    │                               │
                    │  ├── checkpoints/             │
                    │  ├── inheritance/             │
                    │  └── compaction-stats.json    │
                    └───────────────────────────────┘
```

---

## 组件说明

### 1. SummaryQualityValidator (P0-1)

**用途**：验证摘要质量，确保关键信息不丢失。

**验证方法**：
- **规则验证 (快速)**：模式匹配检测技术术语、代码引用、文件路径
- **LLM 验证 (深度)**：使用语言模型评估完整性、准确性、可操作性

**配置选项**：

```typescript
interface SummaryQualityConfig {
  enableRuleValidation: boolean;    // 启用规则验证 (默认: true)
  enableLLMValidation: boolean;     // 启用 LLM 验证 (默认: false)
  minTechTermRetention: number;     // 最小技术术语保留率 (默认: 0.8)
  minCodeRefRetention: number;      // 最小代码引用保留率 (默认: 0.9)
  maxCompressionRatio: number;      // 最大压缩比 (默认: 10)
}
```

**使用示例**：

```typescript
import { SummaryQualityValidator } from '@vellum/core/context/improvements';

const validator = new SummaryQualityValidator({
  enableRuleValidation: true,
  minTechTermRetention: 0.85,
});

// 验证摘要质量
const report = await validator.validate(originalMessages, summaryText);

if (!report.passed) {
  console.log('摘要质量不合格:', report.warnings);
  console.log('丢失的技术术语:', report.ruleResults?.lostItems);
}
```

---

### 2. TruncationStateManager (P0-2)

**用途**：在截断前保存快照，支持内容恢复。

**特性**：
- LRU 淘汰策略管理内存
- 可选 zlib 压缩减少存储
- 自动过期清理

**配置选项**：

```typescript
interface TruncationRecoveryOptions {
  maxSnapshots: number;       // 最大快照数 (默认: 3)
  maxSnapshotSize: number;    // 单快照最大字节 (默认: 1MB)
  enableCompression: boolean; // 启用压缩 (默认: true)
  expirationMs: number;       // 过期时间毫秒 (默认: 30分钟)
}
```

**使用示例**：

```typescript
import { TruncationStateManager } from '@vellum/core/context/improvements';

const manager = new TruncationStateManager({
  maxSnapshots: 5,
  enableCompression: true,
});

// 截断前保存快照
const state = manager.saveSnapshot('trunc-1', messagesToTruncate, 'token_overflow');

// 需要时恢复
const recovered = manager.recoverMessages(state.truncationId);
if (recovered) {
  console.log('恢复了', recovered.length, '条消息');
}
```

---

### 3. CrossSessionInheritanceResolver (P1-1)

**用途**：跨会话继承上下文，保持知识连续性。

**存储结构**：
```
.vellum/inheritance/
├── index.json              # 会话索引
├── session-{id}.json       # 会话摘要
└── project-context.json    # 项目级上下文
```

**配置选项**：

```typescript
interface SessionInheritanceConfig {
  enabled: boolean;                          // 启用继承 (默认: true)
  source: 'last_session' | 'project_context' | 'manual';  // 继承源
  maxInheritedSummaries: number;            // 最大继承摘要数 (默认: 3)
  inheritTypes: InheritanceContentType[];   // 继承内容类型
}

type InheritanceContentType = 'summary' | 'decisions' | 'code_state' | 'pending_tasks';
```

**使用示例**：

```typescript
import { CrossSessionInheritanceResolver } from '@vellum/core/context/improvements';

const resolver = new CrossSessionInheritanceResolver({
  enabled: true,
  source: 'last_session',
  maxInheritedSummaries: 3,
  inheritTypes: ['summary', 'decisions'],
});

await resolver.initialize('/path/to/project');

// 保存当前会话上下文
await resolver.saveSessionContext('session-123', summaries, { custom: 'metadata' });

// 新会话启动时继承上下文
const inherited = await resolver.inheritFromLastSession();
if (inherited) {
  console.log('继承了', inherited.summaries.length, '个摘要');
}
```

---

### 4. SummaryProtectionFilter (P1-2)

**用途**：防止摘要被级联压缩，避免信息逐层丢失。

**问题场景**：
```
M1-M50  → Summary1  (可能丢失细节)
M51-M90 → Summary2
Summary1 + Summary2 → Summary3  ← M1-M50 细节永久丢失!
```

**保护策略**：
- `all`：保护所有摘要
- `recent`：仅保护最近 N 个摘要
- `weighted`：基于重要性评分保护

**配置选项**：

```typescript
interface SummaryProtectionConfig {
  enabled: boolean;                              // 启用保护 (默认: true)
  maxProtectedSummaries: number;                 // 最大保护数 (默认: 5)
  strategy: 'all' | 'recent' | 'weighted';       // 保护策略 (默认: 'recent')
}
```

**使用示例**：

```typescript
import { SummaryProtectionFilter } from '@vellum/core/context/improvements';

const filter = new SummaryProtectionFilter({
  enabled: true,
  maxProtectedSummaries: 5,
  strategy: 'recent',
});

// 获取受保护的摘要 ID
const protectedIds = filter.getProtectedIds(allMessages);

// 过滤压缩候选消息
const safeCandidates = filter.filterCandidates(candidates, allMessages);
// safeCandidates 不包含任何受保护的摘要
```

---

### 5. DiskCheckpointPersistence (P2-1)

**用途**：将检查点持久化到磁盘，支持崩溃恢复。

**存储结构**：
```
.vellum/checkpoints/
├── manifest.json           # 检查点清单
├── cp-xxx.checkpoint       # 检查点文件
└── cp-yyy.checkpoint.gz    # 压缩检查点
```

**持久化策略**：
- `immediate`：创建后立即写入
- `lazy`：下一个空闲周期写入
- `on_demand`：仅在显式请求时写入

**配置选项**：

```typescript
interface DiskCheckpointConfig {
  enabled: boolean;                                      // 启用 (默认: false)
  directory: string;                                     // 存储目录
  maxDiskUsage: number;                                  // 最大磁盘占用 (默认: 100MB)
  strategy: 'immediate' | 'lazy' | 'on_demand';          // 持久化策略
  enableCompression: boolean;                            // 启用压缩 (默认: true)
}
```

**使用示例**：

```typescript
import { DiskCheckpointPersistence } from '@vellum/core/context/improvements';

const persistence = new DiskCheckpointPersistence({
  enabled: true,
  directory: '.vellum/checkpoints',
  maxDiskUsage: 50 * 1024 * 1024, // 50MB
  strategy: 'lazy',
});

await persistence.initialize();

// 持久化检查点
await persistence.persist('checkpoint-1', messages);

// 恢复检查点
const restored = await persistence.restore('checkpoint-1');

// 清理旧检查点
await persistence.cleanup();
```

---

### 6. CompactionStatsTracker (P2-2)

**用途**：追踪压缩统计，检测级联压缩。

**追踪指标**：
- 总压缩次数
- 级联压缩次数
- Token 节省量
- 质量报告历史

**配置选项**：

```typescript
interface CompactionStatsConfig {
  enabled: boolean;         // 启用追踪 (默认: true)
  persist: boolean;         // 持久化到磁盘 (默认: true)
  maxHistoryEntries: number; // 最大历史条目 (默认: 100)
  statsFilePath?: string;   // 统计文件路径
}
```

**使用示例**：

```typescript
import { CompactionStatsTracker } from '@vellum/core/context/improvements';

const tracker = new CompactionStatsTracker({
  enabled: true,
  persist: true,
  maxHistoryEntries: 100,
});

await tracker.initialize('session-123');

// 记录一次压缩
await tracker.record({
  timestamp: Date.now(),
  originalTokens: 5000,
  compressedTokens: 1000,
  messageCount: 20,
  isCascade: false,
});

// 获取统计信息
const stats = tracker.getStats();
console.log(`压缩效率: ${((1 - stats.totalCompressedTokens / stats.totalOriginalTokens) * 100).toFixed(1)}%`);
console.log(`级联压缩次数: ${stats.cascadeCompactions}`);
```

---

### 7. ContextImprovementsManager (统一管理)

**用途**：统一管理所有改进组件，提供集中配置和生命周期管理。

**特性**：
- 集中配置管理
- 懒加载组件实例
- 统一初始化/关闭
- 便捷的访问器方法

**使用示例**：

```typescript
import { 
  ContextImprovementsManager, 
  DEFAULT_IMPROVEMENTS_CONFIG 
} from '@vellum/core/context/improvements';

// 创建管理器（部分配置，其余使用默认值）
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

// 初始化所有组件
await manager.initialize();

// 通过访问器使用各组件
const report = await manager.qualityValidator.validate(messages, summary);
const stats = manager.statsTracker.getStats();
const protected = manager.summaryProtection.getProtectedIds(messages);

// 关闭时清理
await manager.shutdown();
```

---

## 配置指南

### 默认配置

系统提供了保守的生产安全默认值：

```typescript
import { DEFAULT_IMPROVEMENTS_CONFIG } from '@vellum/core/context/improvements';

// 默认配置特点:
// - LLM 验证默认关闭（成本考虑）
// - 磁盘检查点默认关闭
// - 合理的内存和存储限制
```

### 推荐配置

#### 开发环境

```typescript
const devConfig = {
  summaryQuality: {
    enableRuleValidation: true,
    enableLLMValidation: false,  // 开发时无需 LLM 验证
    minTechTermRetention: 0.7,   // 放宽阈值
    minCodeRefRetention: 0.8,
    maxCompressionRatio: 15,
  },
  truncationRecovery: {
    maxSnapshots: 5,             // 更多快照便于调试
    maxSnapshotSize: 2 * 1024 * 1024,
    enableCompression: false,    // 便于检查内容
    expirationMs: 60 * 60 * 1000, // 1小时
  },
  compactionStats: {
    enabled: true,
    persist: true,
    maxHistoryEntries: 200,      // 更多历史
  },
};
```

#### 生产环境

```typescript
const prodConfig = {
  summaryQuality: {
    enableRuleValidation: true,
    enableLLMValidation: true,   // 启用深度验证
    minTechTermRetention: 0.85,  // 更严格
    minCodeRefRetention: 0.95,
    maxCompressionRatio: 8,
  },
  truncationRecovery: {
    maxSnapshots: 3,
    maxSnapshotSize: 1024 * 1024,
    enableCompression: true,
    expirationMs: 15 * 60 * 1000, // 15分钟
  },
  diskCheckpoint: {
    enabled: true,               // 启用崩溃恢复
    directory: '.vellum/checkpoints',
    maxDiskUsage: 100 * 1024 * 1024,
    strategy: 'lazy',
    enableCompression: true,
  },
};
```

### 高级配置选项

#### 自定义 LLM 验证客户端

```typescript
import type { QualityValidationLLMClient } from '@vellum/core/context/improvements';

const customLLMClient: QualityValidationLLMClient = {
  async validateSummary(original, summary) {
    // 自定义 LLM 调用逻辑
    const response = await myLLMProvider.complete({
      prompt: `评估摘要质量...\n原文: ${original}\n摘要: ${summary}`,
    });
    return {
      completenessScore: 8,
      accuracyScore: 9,
      actionabilityScore: 7,
      suggestions: ['建议保留更多代码示例'],
    };
  },
};

const validator = new SummaryQualityValidator(
  { enableLLMValidation: true },
  customLLMClient
);
```

#### 自定义继承存储目录

```typescript
const resolver = new CrossSessionInheritanceResolver({
  enabled: true,
  source: 'project_context',
  maxInheritedSummaries: 5,
  inheritTypes: ['summary', 'decisions', 'code_state'],
});

// 使用自定义目录初始化
await resolver.initialize('/custom/project/path', '/custom/storage/path');
```

---

## 迁移指南

### 从旧版本迁移

如果你之前直接使用 ContextWindowManager，现在可以集成改进组件：

**之前**：

```typescript
const contextManager = new ContextWindowManager(config);
// 无摘要验证
// 无截断恢复
// 无跨会话继承
```

**之后**：

```typescript
import { ContextImprovementsManager } from '@vellum/core/context/improvements';

// 创建改进管理器
const improvements = new ContextImprovementsManager({
  summaryQuality: { enableRuleValidation: true },
  sessionInheritance: { enabled: true },
});

await improvements.initialize();

// 在压缩前验证
const report = await improvements.qualityValidator.validate(messages, summary);
if (!report.passed) {
  // 处理质量问题
}

// 在截断前保存快照
improvements.truncationManager.saveSnapshot('id', messages, 'token_overflow');
```

### 向后兼容性

- 所有新组件默认禁用或使用保守配置
- 不影响现有 ContextWindowManager 行为
- 可逐步启用各组件

### 数据迁移

新版本会自动创建所需的存储目录：

```
.vellum/
├── checkpoints/         # 检查点存储 (P2-1)
├── inheritance/         # 继承数据 (P1-1)
└── compaction-stats.json # 压缩统计 (P2-2)
```

---

## 故障排除

### 常见问题

#### Q1: 摘要验证总是失败

**症状**：`report.passed` 始终为 `false`

**可能原因**：
1. 阈值设置过高
2. 摘要压缩过度

**解决方案**：
```typescript
// 检查具体哪些规则失败
const report = await validator.validate(messages, summary);
console.log('技术术语保留率:', report.ruleResults?.techTermRetention);
console.log('代码引用保留率:', report.ruleResults?.codeRefRetention);
console.log('丢失项目:', report.ruleResults?.lostItems);

// 适当调整阈值
const validator = new SummaryQualityValidator({
  minTechTermRetention: 0.7,  // 降低阈值
  minCodeRefRetention: 0.8,
});
```

#### Q2: 磁盘空间增长过快

**症状**：`.vellum/` 目录占用空间持续增长

**解决方案**：
```typescript
// 1. 减少检查点保留
const diskCheckpoint = new DiskCheckpointPersistence({
  maxDiskUsage: 50 * 1024 * 1024,  // 限制 50MB
});

// 2. 手动清理
await diskCheckpoint.cleanup();

// 3. 减少历史记录
const statsTracker = new CompactionStatsTracker({
  maxHistoryEntries: 50,  // 减少历史
});
```

#### Q3: 跨会话继承不工作

**症状**：新会话未继承上一会话的上下文

**排查步骤**：
```typescript
// 1. 检查是否正确保存
await resolver.saveSessionContext(sessionId, summaries);

// 2. 检查索引文件
// 查看 .vellum/inheritance/index.json

// 3. 检查会话文件
// 查看 .vellum/inheritance/session-{id}.json

// 4. 检查继承调用
const inherited = await resolver.inheritFromLastSession();
console.log('继承结果:', inherited);
```

### 日志分析

启用调试日志：

```typescript
// 设置环境变量
process.env.DEBUG = 'vellum:context-improvements-manager,vellum:summary-quality-validator';

// 或使用 Vellum 日志配置
import { setLogLevel } from '@vellum/core/logger';
setLogLevel('debug');
```

**常见日志模式**：

```
[context-improvements-manager] 组件初始化完成
[summary-quality-validator] 规则验证: techTermRetention=0.82, codeRefRetention=0.91
[truncation-state-manager] 保存快照: id=trunc-1, size=524288, compressed=true
[cross-session-inheritance] 继承上下文: sessionId=session-123, summaries=3
```

---

## API 参考

完整类型定义见 [types.ts](./types.ts)。

导出的主要接口：

```typescript
// 组件
export { SummaryQualityValidator } from './summary-quality-validator';
export { TruncationStateManager } from './truncation-state-manager';
export { CrossSessionInheritanceResolver } from './cross-session-inheritance';
export { SummaryProtectionFilter } from './summary-protection-filter';
export { DiskCheckpointPersistence } from './disk-checkpoint-persistence';
export { CompactionStatsTracker } from './compaction-stats-tracker';
export { ContextImprovementsManager } from './manager';

// 配置类型
export type { SummaryQualityConfig } from './types';
export type { TruncationRecoveryOptions } from './types';
export type { SessionInheritanceConfig } from './types';
export type { SummaryProtectionConfig } from './types';
export type { DiskCheckpointConfig } from './types';
export type { CompactionStatsConfig } from './types';
export type { ContextImprovementsConfig } from './types';

// 默认配置
export { DEFAULT_IMPROVEMENTS_CONFIG } from './types';
```
