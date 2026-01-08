/**
 * Tools Tutorial Lesson
 *
 * Lesson covering tool usage and capabilities.
 *
 * @module cli/onboarding/tutorial/lessons/tools
 */

import type { Lesson } from "../types.js";

/**
 * Tools lesson - learn about available tools
 */
export const toolsLesson: Lesson = {
  id: "tools",
  title: "Working with Tools",
  description: "Learn how to use and manage Vellum's powerful tools",
  category: "tools",
  difficulty: "beginner",
  prerequisites: ["basics"],
  estimatedMinutes: 7,
  icon: "🔧",
  tags: ["tools", "commands", "capabilities"],
  steps: [
    {
      id: "tools-intro",
      title: "Introduction to Tools",
      content: `
**What are Tools?**

Tools are powerful capabilities that Vellum can use to help you:

• **Read files** - Access and understand your code
• **Edit files** - Make changes to your codebase
• **Run commands** - Execute shell commands
• **Search** - Find code across your project
• **And more!**

Tools work automatically when you ask the AI to do something.
      `.trim(),
      action: "read",
      estimatedDuration: 30,
    },
    {
      id: "tools-list",
      title: "Listing Available Tools",
      content: `
**The /tools Command**

To see all available tools:

Try typing: /tools

This shows every tool Vellum can use and its description.
      `.trim(),
      action: "command",
      command: "/tools",
      expectedOutcome: "A list of available tools with descriptions",
      hint: "Type /tools and press Enter",
      estimatedDuration: 30,
    },
    {
      id: "tools-categories",
      title: "Tool Categories",
      content: `
**Tool Categories**

Tools are organized into categories:

📁 **Filesystem** - read, write, list files
🔍 **Search** - grep, semantic search
💻 **Shell** - run terminal commands
🌐 **Web** - fetch URLs, API calls
🔒 **Security** - permission management

Each category serves different needs.
      `.trim(),
      action: "read",
      hint: "Tools automatically activate based on your request",
      estimatedDuration: 45,
    },
    {
      id: "tools-permissions",
      title: "Tool Permissions",
      content: `
**Security & Permissions**

Some tools require approval before running:

• **File edits** - Confirm before modifying files
• **Shell commands** - Approve potentially dangerous commands
• **Network** - Authorize external requests

You control what Vellum can do!

💡 Use /permission to manage approvals.
      `.trim(),
      action: "read",
      hint: "You can always deny a tool action",
      estimatedDuration: 45,
    },
    {
      id: "tools-natural",
      title: "Natural Language Usage",
      content: `
**Just Ask!**

You don't need to know tool names. Just describe what you want:

✅ "Show me the contents of package.json"
✅ "Find all TypeScript files with TODO comments"
✅ "Run the tests"
✅ "Create a new component called Button"

Vellum picks the right tools automatically.
      `.trim(),
      action: "read",
      hint: "Be specific about what you want to achieve",
      estimatedDuration: 30,
    },
    {
      id: "tools-practice",
      title: "Practice: List Files",
      content: `
**Let's Try It!**

Ask Vellum to list files in the current directory:

Example prompts:
• "What files are in this directory?"
• "List the contents of this folder"
• "Show me the project structure"

Try one of these or write your own!
      `.trim(),
      action: "interact",
      expectedOutcome: "Vellum should use the file listing tool",
      hint: "Just type a natural language request",
      estimatedDuration: 60,
    },
    {
      id: "tools-complete",
      title: "Tools Complete!",
      content: `
🎉 **Great Job!**

You now understand Vellum's tool system:

✅ What tools are and how they work
✅ How to list available tools
✅ Tool categories and permissions
✅ Natural language tool usage

**Pro Tips:**
• Let Vellum choose tools automatically
• Review tool actions before approving
• Use /tools to explore capabilities

Next: Try the "Modes" tutorial! 🎯
      `.trim(),
      action: "complete",
      estimatedDuration: 15,
    },
  ],
};

/**
 * Get the tools lesson
 */
export function getToolsLesson(): Lesson {
  return toolsLesson;
}
