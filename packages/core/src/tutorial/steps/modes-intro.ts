/**
 * Modes Introduction Step (Phase 38 - Tutorial)
 *
 * Explains the three coding modes and allows
 * interactive mode switching.
 *
 * @module tutorial/steps/modes-intro
 */

import type { TutorialStep } from "../types.js";

/**
 * Modes introduction content (Markdown)
 */
const MODES_CONTENT = `
# ⚡ Coding Modes

Vellum has **three coding modes** that adapt to different task complexities.
Choose the right mode for the job!

## The Three Modes

### ⚡ Vibe Mode (Worker Level)
- **Fast, autonomous execution** - No checkpoints
- **Full tool access** - Edit, bash, web, MCP
- **Best for**: Quick fixes, trusted tasks, rapid iteration

### 📋 Plan Mode (Workflow Level)
- **Plan-then-execute** - One checkpoint for plan approval
- **Auto-approves edits** - Asks for shell commands
- **Best for**: Complex tasks that benefit from planning

### 📐 Spec Mode (Orchestrator Level)
- **6-phase structured workflow** - Research → Requirements → Design → Tasks → Implementation → Validation
- **Checkpoint at each phase** - Maximum control
- **Best for**: Large features, documentation, architecture

## Switching Modes

| Method | Action |
|--------|--------|
| \`/mode vibe\` | Switch to vibe mode |
| \`/mode plan\` | Switch to plan mode |
| \`/mode spec\` | Switch to spec mode |
| \`Ctrl+1/2/3\` | Quick switch (vibe/plan/spec) |

---

**Try it!** Use \`/mode vibe\` or press **Ctrl+1** to switch modes.
`.trim();

/**
 * Modes introduction step definition
 */
export const modesIntroStep: TutorialStep = {
  id: "modes-intro",
  title: "Coding Modes",
  description: "Learn about vibe, plan, and spec modes",
  icon: "⚡",
  skippable: true,
  content: MODES_CONTENT,
  interactive: {
    type: "mode-switch",
    instruction: "Try switching modes using /mode <name> or Ctrl+1/2/3",
    validate: (result: unknown): boolean => {
      // Accept any mode switch as successful
      return typeof result === "string" && ["vibe", "plan", "spec"].includes(result);
    },
    hint: "Type /mode vibe or /mode plan to switch modes",
  },
  quickRef: [
    "⚡ vibe - Fast & autonomous (Ctrl+1)",
    "📋 plan - Plan first (Ctrl+2)",
    "📐 spec - Full workflow (Ctrl+3)",
  ],
};
