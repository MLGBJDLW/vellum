---
name: summarize
description: Summarize the current file or selection
category: tools
aliases:
  - sum
  - tldr
enabled: true
---

# /summarize Command

Provide a concise summary of the current context.

## Instructions

When this command is invoked:

1. Identify the current context:
   - If text is selected, summarize the selection
   - If a file is open, summarize the file
   - If in a conversation, summarize recent messages

2. Generate a summary that includes:
   - **Purpose**: What does this code/text do?
   - **Key Points**: Main concepts or functionality
   - **Structure**: How is it organized?

3. Keep the summary:
   - Concise (3-5 sentences for small content)
   - Structured (use bullet points for complex content)
   - Actionable (highlight important details)

## Output Format

```markdown
## Summary

**Purpose**: [One-sentence description]

**Key Points**:
- Point 1
- Point 2
- Point 3

**Notable**: [Any important observations]
```

## Examples

### For Code Files

```markdown
## Summary

**Purpose**: HTTP request handler for user authentication

**Key Points**:
- Validates JWT tokens from Authorization header
- Supports both cookie and header-based auth
- Returns 401 for invalid/expired tokens

**Notable**: Rate limiting applied via middleware
```

### For Documentation

```markdown
## Summary

**Purpose**: API reference for the authentication module

**Key Points**:
- 5 endpoints documented (login, logout, refresh, verify, revoke)
- OAuth2 flow supported
- Includes code examples in TypeScript

**Notable**: Breaking changes from v1 noted in migration section
```
