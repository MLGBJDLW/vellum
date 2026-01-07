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
