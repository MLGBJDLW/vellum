/**
 * Modes Tutorial Lesson
 *
 * Lesson covering coding modes and when to use each.
 *
 * @module cli/onboarding/tutorial/lessons/modes
 */

import type { Lesson } from "../types.js";

/**
 * Modes lesson - understand and use coding modes
 */
export const modesLesson: Lesson = {
  id: "modes",
  title: "Mastering Coding Modes",
  description: "Learn when and how to use different coding modes",
  category: "modes",
  difficulty: "intermediate",
  prerequisites: ["basics"],
  estimatedMinutes: 8,
  icon: "⚡",
  tags: ["modes", "workflow", "productivity"],
  steps: [
    {
      id: "modes-intro",
      title: "What are Modes?",
      content: `
**Coding Modes**

Modes customize how Vellum responds to your requests:

• Different system prompts
• Different tool permissions
• Different response styles

Think of modes as "personalities" optimized for specific tasks.
      `.trim(),
      action: "read",
      estimatedDuration: 30,
    },
    {
      id: "modes-check",
      title: "Check Current Mode",
      content: `
**The /mode Command**

To see your current mode:

Try typing: /mode

This shows your active mode and available options.
      `.trim(),
      action: "command",
      command: "/mode",
      expectedOutcome: "Your current mode and list of available modes",
      hint: "Type /mode and press Enter",
      estimatedDuration: 30,
    },
    {
      id: "modes-code",
      title: "Code Mode",
      content: `
**Code Mode** (Default)

Best for:
• Writing new features
• General coding tasks
• Implementation work

Balanced between speed and thoroughness.
      `.trim(),
      action: "read",
      estimatedDuration: 30,
    },
    {
      id: "modes-architect",
      title: "Architect Mode",
      content: `
**Architect Mode**

Best for:
• System design
• API planning
• Architecture decisions
• Refactoring strategies

Focuses on high-level thinking before implementation.

💡 Use when planning major features!
      `.trim(),
      action: "read",
      hint: "Switch with: /mode architect",
      estimatedDuration: 30,
    },
    {
      id: "modes-debug",
      title: "Debug Mode",
      content: `
**Debug Mode**

Best for:
• Fixing bugs
• Error investigation
• Understanding failures
• Performance issues

Methodical, step-by-step analysis approach.

💡 Great when you're stuck on an error!
      `.trim(),
      action: "read",
      hint: "Switch with: /mode debug",
      estimatedDuration: 30,
    },
    {
      id: "modes-explain",
      title: "Explain Mode",
      content: `
**Explain Mode**

Best for:
• Learning new code
• Understanding complex logic
• Documentation
• Code reviews

Detailed explanations with examples.

💡 Perfect for unfamiliar codebases!
      `.trim(),
      action: "read",
      hint: "Switch with: /mode explain",
      estimatedDuration: 30,
    },
    {
      id: "modes-review",
      title: "Review Mode",
      content: `
**Review Mode**

Best for:
• Code review
• Finding issues
• Suggesting improvements
• Best practices check

Critical analysis focused on quality.

💡 Run before submitting PRs!
      `.trim(),
      action: "read",
      hint: "Switch with: /mode review",
      estimatedDuration: 30,
    },
    {
      id: "modes-switch",
      title: "Practice: Switch Modes",
      content: `
**Try Switching!**

Switch to architect mode:

/mode architect

Then switch back to code mode:

/mode code

Notice how the context changes!
      `.trim(),
      action: "command",
      command: "/mode architect",
      expectedOutcome: "Mode should change to architect",
      hint: "Type /mode architect and press Enter",
      estimatedDuration: 45,
    },
    {
      id: "modes-tips",
      title: "Mode Selection Tips",
      content: `
**When to Use Each Mode**

| Situation | Mode |
|-----------|------|
| Writing new code | code |
| Planning features | architect |
| Fixing bugs | debug |
| Learning code | explain |
| Before merge | review |

💡 **Pro Tip**: Start in architect mode for complex tasks,
then switch to code mode for implementation.
      `.trim(),
      action: "read",
      estimatedDuration: 45,
    },
    {
      id: "modes-complete",
      title: "Modes Complete!",
      content: `
🎉 **Excellent Work!**

You've mastered Vellum's coding modes:

✅ Understanding what modes do
✅ Available modes and their purposes
✅ How to switch between modes
✅ When to use each mode

**Your Workflow:**
1. Start in architect mode for planning
2. Switch to code mode for implementation
3. Use debug mode when things break
4. Finish with review mode for quality

You're now a Vellum power user! 🚀
      `.trim(),
      action: "complete",
      estimatedDuration: 15,
    },
  ],
};

/**
 * Get the modes lesson
 */
export function getModesLesson(): Lesson {
  return modesLesson;
}
