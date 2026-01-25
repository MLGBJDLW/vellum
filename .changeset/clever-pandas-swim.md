---
"@butlerw/vellum": patch
---

Context management improvements and bug fixes

### Context Management Improvements (packages/core)
- Add SummaryQualityValidator (P0-1): Validates compression quality to ensure summaries retain critical information
- Add TruncationStateManager (P0-2): Manages truncation state with support for restoring truncated messages
- Add CrossSessionInheritanceResolver (P1-1): Enables cross-session context inheritance
- Add SummaryProtectionFilter (P1-2): Protects summary messages from cascading compression
- Add DiskCheckpointPersistence (P2-1): Disk-based checkpoint persistence with crash recovery support
- Add CompactionStatsTracker (P2-2): Tracks compaction statistics for monitoring compression efficiency
- 16 new files in `packages/core/src/context/improvements/`
- 173 new tests, all passing

### Slash Command Menu Selection Fix (packages/cli)
- Fix incorrect command selection when choosing from `/` menu
- `onSelectionChange` callback now passes the actual selected option
- Use `selectedOption` directly to get the selected item

### OpenTelemetry Fix (packages/core)
- Fix `@opentelemetry/resources` v2.x breaking change: `Resource` → `resourceFromAttributes`
