/**
 * Welcome Step (Phase 38 - Tutorial)
 *
 * First step of the tutorial that introduces Vellum
 * and provides an overview of what will be covered.
 *
 * @module tutorial/steps/welcome
 */

import type { TutorialStep } from "../types.js";

/**
 * Welcome step content (Markdown)
 */
const WELCOME_CONTENT = `
# 👋 Welcome to Vellum!

Vellum is an AI-powered coding assistant that helps you write, refactor, 
and understand code faster. It combines the power of multiple AI providers 
with a thoughtful workflow system.

## What You'll Learn

In this quick tutorial, you'll discover:

1. **Three Coding Modes** - Different approaches for different tasks
2. **Tool Execution** - How Vellum reads, writes, and runs code
3. **Skills System** - Extensible knowledge modules

## Why Vellum?

- 🎯 **Mode-based workflows** - Match your coding approach to the task
- 🔧 **Powerful tools** - File editing, shell commands, web access
- 📚 **Skills** - Domain-specific knowledge that improves over time
- 🔐 **Secure** - Permission system protects your code

---

**Ready to get started?** Press **Enter** to continue, or **Esc** to skip.
`.trim();

/**
 * Welcome step definition
 */
export const welcomeStep: TutorialStep = {
  id: "welcome",
  title: "Welcome to Vellum",
  description: "Introduction to Vellum AI coding assistant",
  icon: "👋",
  skippable: true,
  content: WELCOME_CONTENT,
  quickRef: [
    "Vellum supports multiple AI providers",
    "Three coding modes for different workflows",
    "Skills add domain-specific knowledge",
  ],
};
