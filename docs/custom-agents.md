# Custom Agents

> Create specialized AI agents with custom behaviors, restrictions, and workflows

## Overview

Custom Agents allow you to define specialized AI assistants that inherit from base modes while adding custom system prompts, tool restrictions, and activation triggers.

## Quick Start

```bash
# Create a new agent
/custom-agents create my-agent

# Create from template
/custom-agents create my-agent --template=advanced

# List all agents
/custom-agents list

# Validate agents
/custom-agents validate

# View agent details
/custom-agents info my-agent
```

## Agent Definition Format

Agents are defined as Markdown files with YAML frontmatter:

```markdown
---
slug: my-agent
name: "My Custom Agent"
mode: code
description: "A specialized agent for my workflow"
icon: "🚀"
---

# My Custom Agent

You are a specialized AI assistant...

## Instructions

Your specific instructions go here.
```

## File Locations

Agents are discovered from these locations (in priority order):

| Location | Scope | Path |
|----------|-------|------|
| Project | Workspace | `.vellum/agents/*.md` |
| User | Global | `~/.vellum/agents/*.md` |
| System | Built-in | Bundled with Vellum |

## Configuration Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `slug` | string | Unique identifier (lowercase, hyphens allowed) |
| `name` | string | Human-readable display name |

### Optional Fields

#### Base Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `extends` | string | - | Parent agent to inherit from |
| `mode` | string | `code` | Base mode: `plan`, `code`, `draft`, `debug`, `ask` |
| `description` | string | - | Brief description (max 500 chars) |
| `version` | string | - | Semantic version |
| `author` | string | - | Creator identifier |
| `tags` | string[] | - | Categorization tags |
| `hidden` | boolean | `false` | Hide from listings |

#### UI Configuration

| Field | Type | Description |
|-------|------|-------------|
| `icon` | string | Emoji or icon identifier |
| `color` | string | Hex color code for UI display |

#### Tool Configuration

| Field | Type | Description |
|-------|------|-------------|
| `toolGroups` | array | Tool group access configuration |
| `restrictions` | object | File and execution restrictions |

#### Runtime Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `settings.temperature` | number | 0.7 | LLM temperature (0.0-1.0) |
| `settings.extendedThinking` | boolean | false | Enable extended reasoning |
| `settings.streamOutput` | boolean | true | Stream responses |
| `settings.autoConfirm` | boolean | false | Auto-approve tool calls |

#### Activation Triggers

```yaml
whenToUse:
  description: "Use for testing tasks"
  triggers:
    - type: file
      pattern: "**/*.test.ts"
    - type: keyword
      pattern: "test|spec|coverage"
    - type: regex
      pattern: "^(fix|bug):"
  priority: 10
```

#### Multi-Agent Coordination

```yaml
level: orchestrator  # worker | workflow | orchestrator
coordination:
  canSpawnAgents:
    - coder
    - reviewer
  maxConcurrentSubagents: 3
```

## Templates

### Basic Template

Minimal configuration for simple agents:

```bash
/custom-agents create my-agent --template=basic
```

```yaml
---
slug: my-agent
name: "My Agent"
mode: code
description: "Custom agent"
icon: "🤖"
---
```

### Advanced Template

Full configuration with restrictions and settings:

```bash
/custom-agents create my-agent --template=advanced
```

Includes:
- Tool group configuration
- File restrictions
- Runtime settings
- Activation triggers

### Orchestrator Template

For multi-agent workflows:

```bash
/custom-agents create my-agent --template=orchestrator
```

Includes:
- Orchestrator level
- Agent coordination config
- Extended thinking enabled

## CLI Commands

### list

List all discovered agents grouped by scope.

```bash
/custom-agents list              # All agents
/custom-agents list --json       # JSON output
/custom-agents list --global     # User-level only
/custom-agents list --local      # Project-level only
```

### create

Create a new agent from a template.

```bash
/custom-agents create <slug>
/custom-agents create <slug> --template=advanced
/custom-agents create <slug> --global  # Create in ~/.vellum/agents/
```

### validate

Validate agent definition files.

```bash
/custom-agents validate              # All agents
/custom-agents validate <slug>       # Specific agent
/custom-agents validate --strict     # Treat warnings as errors
```

### info

Show detailed agent information.

```bash
/custom-agents info <slug>
/custom-agents info <slug> --json
/custom-agents info <slug> --show-prompt
```

### export

Export agent definition to file.

```bash
/custom-agents export <slug>
/custom-agents export <slug> --output=./agent.yaml
/custom-agents export <slug> --format=json
```

### import

Import agent from YAML/JSON file.

```bash
/custom-agents import ./agent.yaml
/custom-agents import ./agent.json --global
```

## Examples

### Test Writer Agent

```markdown
---
slug: test-writer
name: "Test Writer"
mode: code
description: "Specialized agent for writing tests"
icon: "🧪"
tags:
  - testing
  - quality

toolGroups:
  - group: filesystem
    enabled: true
  - group: shell
    enabled: true

restrictions:
  fileRestrictions:
    - pattern: "**/*.test.ts"
      access: write
    - pattern: "**/*.spec.ts"
      access: write
    - pattern: "src/**"
      access: read

whenToUse:
  description: "Use for writing or fixing tests"
  triggers:
    - type: file
      pattern: "**/*.test.ts"
    - type: keyword
      pattern: "test|spec|coverage|jest|vitest"
  priority: 15
---

# Test Writer

You are a test writing specialist.

## Guidelines

1. Write comprehensive test cases
2. Use the testing framework found in the project
3. Follow AAA pattern (Arrange, Act, Assert)
4. Include edge cases and error handling
```

### Security Reviewer Agent

```markdown
---
slug: security-reviewer
name: "Security Reviewer"
mode: plan
description: "Security-focused code review agent"
icon: "🔒"

settings:
  temperature: 0.3
  extendedThinking: true

restrictions:
  fileRestrictions:
    - pattern: "**/*"
      access: read
  toolGroups:
    - group: shell
      enabled: false
---

# Security Reviewer

You are a security expert reviewing code for vulnerabilities.

## Focus Areas

- SQL injection
- XSS vulnerabilities
- Authentication/authorization issues
- Sensitive data exposure
- Dependency vulnerabilities
```

## Agent Routing

When you start a conversation, Vellum automatically suggests relevant agents based on:

1. **File patterns** - Current file matches trigger patterns
2. **Keywords** - Message contains relevant keywords
3. **Priority** - Higher priority agents are preferred

You can also explicitly invoke an agent:

```
@test-writer write tests for the user service
```

## Inheritance

Agents can inherit from other agents:

```yaml
---
slug: react-tester
extends: test-writer
name: "React Tester"
description: "Specialized for React component testing"
---

Additional React-specific instructions...
```

The child agent inherits:
- System prompt (prepended to child's prompt)
- Tool configurations
- Settings (can be overridden)

## JSON Schema

For IDE support (autocompletion in YAML/JSON), export the schema:

```typescript
import { generateJsonSchema } from "@vellum/core";

const schema = generateJsonSchema();
// Use in VS Code settings.json:
// "yaml.schemas": { "./agent-schema.json": ".vellum/agents/*.yaml" }
```

## Best Practices

1. **Use clear slugs** - Lowercase, descriptive, hyphenated
2. **Write focused prompts** - Specific instructions work better
3. **Set appropriate restrictions** - Limit tool access when possible
4. **Use triggers wisely** - Don't over-trigger on common words
5. **Test your agents** - Use `/custom-agents validate`
6. **Version your agents** - Track changes with version field
