/**
 * Completion Step (Phase 38 - Tutorial)
 *
 * Final step showing summary and quick reference card.
 *
 * @module tutorial/steps/completion
 */

import type { TutorialStep } from "../types.js";

/**
 * Completion content (Markdown)
 */
const COMPLETION_CONTENT = `
# 🎉 Tutorial Complete!

Congratulations! You've learned the essentials of Vellum.

## What You Learned

### ⚡ Coding Modes
- **vibe** - Fast autonomous coding for quick tasks
- **plan** - Plan-then-execute for complex work
- **spec** - 6-phase workflow for large features

### 🔧 Tool Execution
- Vellum uses tools to read, write, and run code
- Permissions protect against dangerous actions
- Natural language describes your tasks

### 📚 Skills System
- Skills add domain-specific knowledge
- Automatically matched to your tasks
- Create your own in \`~/.vellum/skills/\`

---

## 📋 Quick Reference

| Action | Command |
|--------|---------|
| Switch to vibe mode | \`/mode vibe\` or \`Ctrl+1\` |
| Switch to plan mode | \`/mode plan\` or \`Ctrl+2\` |
| Switch to spec mode | \`/mode spec\` or \`Ctrl+3\` |
| Restart tutorial | \`/tutorial\` |
| Show help | \`/help\` |

---

## Next Steps

1. **Try vibe mode** - Great for quick edits
2. **Explore skills** - Check \`~/.vellum/skills/\`
3. **Read docs** - \`vellum docs\` opens documentation

---

**You're ready to code with AI!** Press **Enter** to start.
`.trim();

/**
 * Completion step definition
 */
export const completionStep: TutorialStep = {
  id: "completion",
  title: "Tutorial Complete",
  description: "Summary and quick reference",
  icon: "🎉",
  skippable: false,
  content: COMPLETION_CONTENT,
  quickRef: [
    "/mode vibe|plan|spec - Switch modes",
    "/tutorial - Restart this tutorial",
    "/help - Show all commands",
  ],
};
