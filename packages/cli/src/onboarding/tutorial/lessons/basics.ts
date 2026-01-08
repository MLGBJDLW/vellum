/**
 * Basics Tutorial Lesson
 *
 * Getting started lesson that covers fundamental Vellum concepts.
 *
 * @module cli/onboarding/tutorial/lessons/basics
 */

import type { Lesson } from "../types.js";

/**
 * Getting Started lesson - covers basic Vellum usage
 */
export const basicsLesson: Lesson = {
  id: "basics",
  title: "Getting Started with Vellum",
  description: "Learn the fundamentals of using Vellum AI coding assistant",
  category: "basics",
  difficulty: "beginner",
  prerequisites: [],
  estimatedMinutes: 5,
  icon: "📚",
  tags: ["beginner", "introduction", "fundamentals"],
  steps: [
    {
      id: "basics-welcome",
      title: "Welcome to Vellum",
      content: `
Welcome to Vellum! 🎉

Vellum is an AI-powered coding assistant that helps you write, debug,
and understand code faster.

This tutorial will teach you the basics:
• How to interact with the AI
• How to use slash commands
• How to get the most out of Vellum

Press Enter to continue...
      `.trim(),
      action: "read",
      estimatedDuration: 30,
    },
    {
      id: "basics-chat",
      title: "Chatting with the AI",
      content: `
**Talking to Vellum**

Simply type your question or request in natural language:

• "Explain this function"
• "Write a unit test for this code"
• "Fix the bug in line 42"
• "Refactor this to use async/await"

The AI understands context from your project and current file.

💡 Tip: Be specific about what you want for better results!
      `.trim(),
      action: "read",
      hint: "Try asking the AI to explain something simple",
      estimatedDuration: 45,
    },
    {
      id: "basics-help",
      title: "Using the Help Command",
      content: `
**Slash Commands**

Vellum has built-in commands that start with "/":

Try typing: /help

This shows all available commands and their descriptions.
      `.trim(),
      action: "command",
      command: "/help",
      expectedOutcome: "You should see a list of available commands",
      hint: "Type /help and press Enter",
      estimatedDuration: 30,
    },
    {
      id: "basics-clear",
      title: "Clearing the Screen",
      content: `
**The /clear Command**

To clear the conversation history and start fresh:

Try typing: /clear

This clears the display but keeps your session active.
      `.trim(),
      action: "command",
      command: "/clear",
      expectedOutcome: "The screen should be cleared",
      hint: "Type /clear and press Enter",
      estimatedDuration: 20,
    },
    {
      id: "basics-mode",
      title: "Understanding Modes",
      content: `
**Coding Modes**

Vellum has different modes for different tasks:

• **code** - General coding assistance
• **architect** - System design and architecture
• **debug** - Focused debugging help
• **explain** - Code explanations
• **review** - Code review

Use /mode to see current mode or switch modes.
      `.trim(),
      action: "read",
      hint: "Try /mode to see your current mode",
      estimatedDuration: 45,
    },
    {
      id: "basics-complete",
      title: "Basics Complete!",
      content: `
🎉 **Congratulations!**

You've learned the basics of Vellum:

✅ How to chat with the AI
✅ How to use slash commands
✅ How to get help
✅ Understanding modes

**Next Steps:**
• Try the "Tools" tutorial to learn about available tools
• Try the "Modes" tutorial for advanced mode usage

Happy coding! 🚀
      `.trim(),
      action: "complete",
      estimatedDuration: 15,
    },
  ],
};

/**
 * Get the basics lesson
 */
export function getBasicsLesson(): Lesson {
  return basicsLesson;
}
