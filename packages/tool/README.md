# @vellum/tool

> ⚠️ **DEPRECATED**: This package is deprecated. Please use `@vellum/core` instead.

## Migration

All tool functionality has been consolidated into `@vellum/core`.

```typescript
// Before (deprecated)
import { ToolRegistry, defineTool } from '@vellum/tool';

// After (recommended)
import { createToolRegistry, defineTool } from '@vellum/core';

// For builtin tools:
import { readFileTool, writeFileTool } from '@vellum/core';
```

## Why?

The tool system has been integrated directly into `@vellum/core` for:

- Better integration with the agent loop
- Unified registry management
- Reduced package dependencies
- Simpler import paths

See [packages/core/MIGRATION.md](../core/MIGRATION.md) for detailed migration instructions.
