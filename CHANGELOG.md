# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING**: Upgraded Zod from v3.25.76 to v4.3.5
  - Type imports: `ZodTypeAny` → `ZodType` (1 file, 3 occurrences)
  - JSON schema: Using native `z.toJSONSchema()` instead of `zodToJsonSchema`
  - Test UUIDs: RFC 4122 compliant format required
  - Schema defaults: Explicit default handling for partial schemas
  - Error messages: Updated assertions for Zod v4 error format
- Upgraded React from 18.3.1 to 19.2.3
- Upgraded Ink from 5.1.0 to 6.6.0
- Upgraded @types/react from 18.3.12 to 19.0.0
- Migrated all context providers to React 19 simplified Context API pattern
  (removed `.Provider` in favor of direct context component usage)

### Internal

- Updated 5 context provider files to use `<Context value={...}>` pattern:
  - AppContext.tsx
  - MessagesContext.tsx
  - McpContext.tsx
  - ToolsContext.tsx
  - theme/provider.tsx
