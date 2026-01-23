---
"@butlerw/vellum": patch
---

### fix(release)
- Fixed release.yml regex patterns for changelog categorization by adding `^- ` prefix to match git log output format

### chore(cleanup)
- Removed orphaned `RateLimitIndicator.tsx` component (never integrated into TUI)
- Removed deprecated `LoopEvent` type from `packages/core/src/types.ts` (inlined into agent.ts)
- Removed deprecated type files from `packages/shared/src/types/`:
  - `agent.ts`, `message.ts`, `provider.ts`, `tool.ts`
- Updated barrel exports in `packages/shared/src/index.ts` and `packages/core/src/index.ts`
