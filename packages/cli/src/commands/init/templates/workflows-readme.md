# Workflows Directory

Multi-step workflows for complex tasks. Workflows define a sequence of phases that guide the AI through structured processes.

## Structure

```text
workflows/
├── {workflow-name}.md    # Workflow definition
└── README.md
```

## File Format

```markdown
---
name: feature
description: Implement a new feature with full lifecycle
version: "1.0.0"
phases:
  - name: research
    description: Understand requirements
  - name: design
    description: Create implementation plan
  - name: implement
    description: Write the code
  - name: test
    description: Add tests
  - name: document
    description: Update documentation
---

# Feature Workflow

Structured workflow for implementing new features.

## Phase 1: Research

- Understand the feature requirements
- Identify affected components
- List dependencies

## Phase 2: Design

- Create high-level design
- Define interfaces
- Plan file changes

## Phase 3: Implement

- Write implementation code
- Follow coding standards
- Keep changes minimal

## Phase 4: Test

- Add unit tests
- Run existing tests
- Fix any regressions

## Phase 5: Document

- Update README if needed
- Add JSDoc comments
- Update changelog
```markdown

## Frontmatter Options

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Workflow identifier (required) |
| `description` | string | Brief description (required) |
| `version` | string | Semantic version |
| `phases` | array | Phase definitions |
| `phases[].name` | string | Phase identifier |
| `phases[].description` | string | Phase description |

## Usage

```bash
# Start a workflow
/workflow feature

# View available workflows
/workflow list

# Get help
/workflow help
```

## Documentation

See [Vellum Workflows Documentation](https://vellum.dev/docs/workflows) for more details.
