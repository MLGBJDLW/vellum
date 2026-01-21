# Contributing to Vellum

Thank you for your interest in contributing to Vellum! This guide will help you get started.

## How to Contribute

### Reporting Issues

1. Check [existing issues](https://github.com/vellum/vellum/issues) first
2. Use the issue template
3. Include reproduction steps
4. Attach relevant logs (redact sensitive data)

### Suggesting Features

1. Open a [feature request](https://github.com/vellum/vellum/issues/new?template=feature_request.md)
2. Describe the use case
3. Propose a solution (optional)

### Submitting Code

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## Development Setup

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| pnpm | 9+ |
| Bun | 1.1+ (optional) |

### Installation

```bash
# Clone the repository
git clone https://github.com/MLGBJDLW/vellum.git
cd vellum

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test --run
```

### Development Commands

```bash
# Start development mode (watch)
pnpm dev

# Run specific package tests
pnpm --filter @vellum/core test --run

# Type check
pnpm typecheck

# Lint
pnpm lint

# Format code
pnpm format
```

## Code Style

### TypeScript Rules

- **Strict types**: No `any` types
- **Named exports**: No default exports
- **Const assertions**: Use `as const` for literals
- **Result types**: Use `Result<T, E>` for operations that can fail

### File Naming

| Item | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `tool-registry.ts` |
| Tests | `*.test.ts` | `tool-registry.test.ts` |
| Types | PascalCase | `ToolRegistry` |
| Functions | camelCase | `registerTool` |
| Constants | SCREAMING_SNAKE | `MAX_RETRIES` |

### Formatting

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
# Check formatting
pnpm lint

# Fix formatting
pnpm format
```

### Example Code

```typescript
// ✅ Good
import type { Tool } from "./types.js";

const TIMEOUT_MS = 5000 as const;

export function createTool(name: string): Tool {
  return { name, timeout: TIMEOUT_MS };
}

// ❌ Avoid
import Tool from "./types";  // default import

let timeout = 5000;  // mutable

export default function(name: any) {  // any type
  return { name, timeout };
}
```

## Testing

### Running Tests

```bash
# All tests
pnpm test --run

# Watch mode
pnpm test

# With coverage
pnpm test --run --coverage

# Single file
pnpm test --run src/specific.test.ts
```

### Writing Tests

```typescript
import { describe, expect, it, vi } from "vitest";

describe("ToolRegistry", () => {
  it("should register a tool", () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool());
    
    expect(registry.size).toBe(1);
  });

  it("should throw on duplicate registration", () => {
    const registry = new ToolRegistry();
    const tool = createMockTool();
    
    registry.register(tool);
    
    expect(() => registry.register(tool)).toThrow();
  });
});

// Test factory
function createMockTool(overrides?: Partial<Tool>): Tool {
  return {
    name: "test-tool",
    description: "Test",
    execute: vi.fn(),
    ...overrides,
  };
}
```

## Pull Request Guidelines

### Before Submitting

- [ ] Code compiles: `pnpm typecheck`
- [ ] Tests pass: `pnpm test --run`
- [ ] Linting passes: `pnpm lint`
- [ ] No `any` types introduced
- [ ] Tests added for new code
- [ ] Documentation updated (if applicable)

### PR Title Format

```text
<type>(<scope>): <description>

Examples:
feat(core): add session export functionality
fix(provider): handle rate limit errors correctly
docs: update MCP configuration guide
chore(deps): update Anthropic SDK to 0.30.0
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `style` | Formatting (no code change) |
| `refactor` | Code restructuring |
| `test` | Adding tests |
| `chore` | Maintenance tasks |

### Review Process

1. Automated CI checks must pass
2. At least 1 maintainer approval required
3. Address all review comments
4. Squash commits if requested

## Project Structure

```text
vellum/
├── packages/
│   ├── cli/        # CLI entry point
│   ├── core/       # Core agent logic
│   ├── provider/   # LLM providers
│   ├── mcp/        # MCP integration
│   ├── shared/     # Shared utilities
│   └── tui/        # Terminal UI
├── docs/           # Documentation
└── scripts/        # Build scripts
```

## Questions?

- Open a [discussion](https://github.com/vellum/vellum/discussions)
- Check the [documentation](docs/)
- Review [AGENTS.md](AGENTS.md) for detailed architecture
