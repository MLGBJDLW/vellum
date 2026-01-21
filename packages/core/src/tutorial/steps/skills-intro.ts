/**
 * Skills Introduction Step (Phase 38 - Tutorial)
 *
 * Explains the skills system and how to add custom skills.
 *
 * @module tutorial/steps/skills-intro
 */

import type { TutorialStep } from "../types.js";

/**
 * Skills introduction content (Markdown)
 */
const SKILLS_CONTENT = `
# 📚 Skills System

**Skills** are knowledge modules that teach Vellum domain-specific expertise.
They're automatically matched to your tasks.

## What Are Skills?

Skills are Markdown files with structured knowledge:

\`\`\`markdown
---
name: typescript-patterns
description: TypeScript best practices
triggers:
  - "typescript"
  - "*.ts"
---

## Rules
- Use strict types, avoid \`any\`
- Prefer interfaces over types for extensibility
- Use discriminated unions for state

## Patterns
- Factory pattern for complex objects
- Builder pattern for configuration
\`\`\`

## Skill Locations

| Location | Scope |
|----------|-------|
| \`~/.vellum/skills/\` | Personal (all projects) |
| \`.vellum/skills/\` | Project (this repo only) |
| \`.github/skills/\` | Team (shared via git) |

## Automatic Matching

Skills activate when:
- **Trigger words** match your task ("typescript", "testing")
- **File patterns** match (\`*.ts\`, \`*.test.ts\`)
- **Directory patterns** match (\`src/**\`, \`tests/**\`)

## Built-in Skills

Vellum includes skills for:
- 🔧 Code refactoring patterns
- 🧪 Testing best practices
- 🎨 Frontend design
- 🔐 Error handling

---

**Next**: You can create skills in \`~/.vellum/skills/\` anytime!
`.trim();

/**
 * Skills introduction step definition
 */
export const skillsIntroStep: TutorialStep = {
  id: "skills-intro",
  title: "Skills System",
  description: "Learn how skills add domain expertise",
  icon: "📚",
  skippable: true,
  content: SKILLS_CONTENT,
  interactive: {
    type: "add-skill",
    instruction: "Optional: Create a skill file in ~/.vellum/skills/",
    validate: (_result: unknown): boolean => {
      // Skills step is informational, always passes
      return true;
    },
    hint: "Skills are optional but powerful. You can add them anytime.",
  },
  quickRef: [
    "Skills are Markdown files with frontmatter",
    "~/.vellum/skills/ for personal skills",
    ".vellum/skills/ for project skills",
    "Auto-matched by triggers and patterns",
  ],
};
