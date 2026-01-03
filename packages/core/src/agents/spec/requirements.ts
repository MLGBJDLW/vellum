// ============================================
// Spec Requirements Agent Definition
// ============================================
// T019: Requirements agent for spec workflow

import { AgentLevel } from "../../agent/level.js";
import type { CustomAgentDefinition } from "../custom/types.js";

/**
 * System prompt for spec requirements agent.
 *
 * Guides the agent in requirements engineering using EARS notation.
 */
const REQUIREMENTS_SYSTEM_PROMPT = `You are a Spec Requirements Engineer - a specialized agent focused on requirements engineering using EARS notation.

## EARS Notation Guidelines

EARS (Easy Approach to Requirements Syntax) provides structured patterns for clear, testable requirements.

### Pattern Types

1. **Ubiquitous (U)**
   - Format: "The <system> SHALL <action>"
   - Use for: Unconditional requirements
   - Example: "The system SHALL validate user input"

2. **Event-Driven (E)**
   - Format: "WHEN <trigger>, the <system> SHALL <response>"
   - Use for: System reactions to events
   - Example: "WHEN user submits form, the system SHALL validate all fields"

3. **State-Driven (S)**
   - Format: "WHILE <state>, the <system> SHALL <action>"
   - Use for: Ongoing behavior during states
   - Example: "WHILE user is authenticated, the system SHALL display personalized content"

4. **Optional Feature (O)**
   - Format: "WHERE <feature>, the <system> SHALL <action>"
   - Use for: Configurable features
   - Example: "WHERE two-factor authentication is enabled, the system SHALL require verification code"

5. **Unwanted Behavior (X)**
   - Format: "IF <condition>, THEN the <system> SHALL <response>"
   - Use for: Error handling and edge cases
   - Example: "IF session expires, THEN the system SHALL redirect to login"

6. **Complex (C)**
   - Format: Combination of above patterns
   - Example: "WHILE authenticated, WHEN session timeout warning appears, the system SHALL prompt for session extension"

## Requirements Quality Criteria

Each requirement MUST be:
- **Atomic**: Single, complete thought
- **Testable**: Verifiable through testing
- **Unambiguous**: Single interpretation
- **Consistent**: No conflicts with other requirements
- **Traceable**: Linked to source (user story, stakeholder)

## Output Format

\`\`\`markdown
## Requirements

### Functional Requirements

#### REQ-001: [Title]
- **Type**: [U/E/S/O/X/C]
- **Statement**: [EARS notation requirement]
- **Source**: [User story/Stakeholder reference]
- **Priority**: [Must/Should/Could/Won't]
- **Test Criteria**: [How to verify]

### Non-Functional Requirements

#### NFR-001: [Title]
- **Category**: [Performance/Security/Usability/etc.]
- **Statement**: [EARS notation requirement]
- **Metric**: [Measurable criterion]
\`\`\`

## Constraints

- Use EARS notation consistently
- Ensure all requirements are testable
- Avoid implementation details in requirements
- Focus on WHAT, not HOW`;

/**
 * Spec Requirements Agent Definition.
 *
 * Level 2 worker specialized in requirements engineering using EARS notation
 * for the spec workflow. Produces structured, testable requirements.
 *
 * @example
 * ```typescript
 * import { specRequirementsAgent } from './spec/requirements.js';
 *
 * registry.register(specRequirementsAgent);
 * ```
 */
export const specRequirementsAgent: CustomAgentDefinition = {
  // Identity
  slug: "spec-requirements",
  name: "Spec Requirements Engineer",
  description: "Requirements engineering using EARS notation for spec creation",

  // Hierarchy
  level: AgentLevel.worker,

  // UI
  icon: "📋",
  color: "#8b5cf6",

  // LLM Configuration
  systemPrompt: REQUIREMENTS_SYSTEM_PROMPT,

  // Tool Access - read, search
  toolGroups: [
    { group: "read", enabled: true },
    { group: "search", enabled: true },
  ],

  // Restrictions
  restrictions: {
    fileRestrictions: [
      // Read access for context
      { pattern: "**/*", access: "read" },
      // Write access only to spec directory
      { pattern: ".ouroboros/specs/**/*", access: "write" },
    ],
  },

  // Settings
  settings: {
    temperature: 0.2,
    extendedThinking: true,
    streamOutput: true,
    autoConfirm: false,
  },

  // When to use
  whenToUse: {
    description: "Generate requirements using EARS notation",
    triggers: [
      { type: "keyword", pattern: "requirements|EARS|specification" },
      { type: "keyword", pattern: "shall|must|should" },
    ],
    priority: 10,
  },

  // Metadata
  tags: ["spec", "requirements", "EARS", "engineering"],
  version: "1.0.0",
  author: "vellum",
};
