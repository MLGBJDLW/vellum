/**
 * First Task Step (Phase 38 - Tutorial)
 *
 * Guides user through running a simple task
 * to demonstrate tool execution.
 *
 * @module tutorial/steps/first-task
 */

import type { TutorialStep } from "../types.js";

/**
 * First task content (Markdown)
 */
const FIRST_TASK_CONTENT = `
# 🔧 Running Your First Task

Let's see Vellum in action! When you give Vellum a task, it uses **tools**
to accomplish it.

## Available Tools

| Tool | Purpose |
|------|---------|
| 📖 **Read** | View file contents |
| ✏️ **Edit** | Modify files |
| 🔍 **Search** | Find files and code |
| 💻 **Shell** | Run terminal commands |
| 🌐 **Web** | Access documentation |

## How It Works

1. **You describe the task** - Natural language is fine!
2. **Vellum plans** - Determines which tools to use
3. **Tools execute** - Files are read, edited, commands run
4. **Results shown** - You see what changed

## Tool Permissions

Vellum asks permission before potentially dangerous actions:
- 🟢 **Auto-approved**: Reading files, searching
- 🟡 **Mode-dependent**: File edits (auto in vibe, ask in spec)
- 🔴 **Always ask**: Shell commands, external requests

## Example Tasks

Try asking Vellum to:
- "Show me the main function in index.ts"
- "Add a comment to the first line of README.md"
- "List files in the current directory"

---

**Try it!** Ask Vellum to read a file or list the current directory.
`.trim();

/**
 * First task step definition
 */
export const firstTaskStep: TutorialStep = {
  id: "first-task",
  title: "Your First Task",
  description: "See how Vellum executes tasks with tools",
  icon: "🔧",
  skippable: true,
  content: FIRST_TASK_CONTENT,
  interactive: {
    type: "run-task",
    instruction: "Try running a simple task like 'list files' or 'show README'",
    validate: (result: unknown): boolean => {
      // Accept any tool execution as successful
      return result !== null && result !== undefined;
    },
    hint: "Type a natural language request like 'list files in current directory'",
  },
  quickRef: [
    "Tools: read, edit, search, shell, web",
    "Permissions protect dangerous actions",
    "Natural language works great",
  ],
};
