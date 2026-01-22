/**
 * Copy Slash Command
 *
 * Provides clipboard functionality for the CLI:
 * - /copy last - Copy the last assistant message
 * - /copy code - Copy the last code block
 * - /copy file <path> - Copy file contents
 *
 * @module cli/commands/copy
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { AgentLoop, SessionMessage } from "@vellum/core";
import { copy, isSupported } from "../tui/services/clipboard.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Module State
// =============================================================================

/**
 * Reference to the active AgentLoop instance.
 * Set by the App component when an agent session is active.
 */
let agentLoopRef: AgentLoop | null = null;

/**
 * Set the AgentLoop instance for copy commands.
 * Called by the App component when an agent session starts/ends.
 *
 * @param loop - The AgentLoop instance to use, or null when session ends
 */
export function setCopyCommandLoop(loop: AgentLoop | null): void {
  agentLoopRef = loop;
}

/**
 * Get the current AgentLoop instance.
 * Returns null if no agent session is active.
 */
export function getCopyCommandLoop(): AgentLoop | null {
  return agentLoopRef;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract text content from a SessionMessage's parts.
 */
function extractTextFromMessage(msg: SessionMessage): string {
  return msg.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

/**
 * Extract the last assistant message from session messages.
 */
function getLastAssistantMessage(messages: SessionMessage[]): string | undefined {
  // Iterate from end to find last assistant message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === "assistant") {
      const text = extractTextFromMessage(msg);
      if (text) {
        return text;
      }
    }
  }
  return undefined;
}

/**
 * Extract code blocks from text content.
 * Returns array of { language, code } objects.
 */
function extractCodeBlocks(text: string): Array<{ language: string; code: string }> {
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  const blocks: Array<{ language: string; code: string }> = [];

  for (const match of text.matchAll(codeBlockRegex)) {
    blocks.push({
      language: match[1] || "text",
      code: match[2]?.trim() || "",
    });
  }

  return blocks;
}

/**
 * Get the last code block from session messages.
 */
function getLastCodeBlock(
  messages: SessionMessage[]
): { language: string; code: string } | undefined {
  // Search from most recent message backwards
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;

    const content = extractTextFromMessage(msg);
    const blocks = extractCodeBlocks(content);
    if (blocks.length > 0) {
      // Return the last block in this message
      return blocks[blocks.length - 1];
    }
  }

  return undefined;
}

/**
 * Read file content with size limit check.
 */
async function readFileContent(
  filePath: string,
  cwd: string
): Promise<{ content: string } | { error: string }> {
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);

  try {
    const stat = await fs.stat(resolvedPath);

    // 1MB size limit for clipboard
    const MAX_SIZE = 1024 * 1024;
    if (stat.size > MAX_SIZE) {
      return {
        error: `File too large (${Math.round(stat.size / 1024)}KB). Maximum is 1MB.`,
      };
    }

    const content = await fs.readFile(resolvedPath, "utf-8");
    return { content };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { error: `File not found: ${filePath}` };
    }
    if ((err as NodeJS.ErrnoException).code === "EACCES") {
      return { error: `Permission denied: ${filePath}` };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Failed to read file: ${message}` };
  }
}

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * /copy command - Copy content to clipboard
 *
 * Subcommands:
 * - last: Copy the last assistant message
 * - code: Copy the last code block
 * - file <path>: Copy file contents
 */
export const copyCommand: SlashCommand = {
  name: "copy",
  description: "Copy content to clipboard",
  kind: "builtin",
  category: "tools",
  aliases: ["cp", "yank"],
  positionalArgs: [
    {
      name: "target",
      type: "string",
      description: "What to copy: last, code, or file",
      required: false,
    },
    {
      name: "path",
      type: "path",
      description: "File path (when target is 'file')",
      required: false,
    },
  ],
  subcommands: [
    { name: "last", description: "Copy the last assistant message" },
    { name: "code", description: "Copy the last code block" },
    { name: "file", description: "Copy file contents" },
  ],
  examples: [
    "/copy last      - Copy last message",
    "/copy code      - Copy last code block",
    "/copy file src/index.ts",
  ],

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const { parsedArgs, session } = ctx;
    const target = parsedArgs.positional[0] as string | undefined;
    const filePath = parsedArgs.positional[1] as string | undefined;

    // Check clipboard support
    if (!isSupported()) {
      return error("OPERATION_NOT_ALLOWED", "Clipboard not supported in this environment", [
        "Clipboard access requires a display server or Windows/macOS.",
        "",
        "On Linux, try installing: sudo apt install xclip",
        "In WSL, ensure Windows clipboard integration is enabled.",
      ]);
    }

    // Default to showing help if no target
    if (!target) {
      return success(
        [
          "📋 Copy Command",
          "",
          "Usage:",
          "  /copy last        Copy the last assistant message",
          "  /copy code        Copy the last code block",
          "  /copy file <path> Copy file contents",
          "",
          "Aliases: /cp, /yank",
        ].join("\n")
      );
    }

    // Handle file copy (doesn't require agent loop)
    if (target === "file") {
      if (!filePath) {
        return error("MISSING_ARGUMENT", "File path required", [
          "Usage: /copy file <path>",
          "Example: /copy file src/index.ts",
        ]);
      }

      const result = await readFileContent(filePath, session.cwd);
      if ("error" in result) {
        return error("FILE_NOT_FOUND", result.error);
      }

      const copyResult = await copy(result.content, `file: ${filePath}`);
      if (!copyResult.success) {
        return error("INTERNAL_ERROR", copyResult.error);
      }

      const lines = result.content.split("\n").length;
      return success(`📋 Copied ${path.basename(filePath)} (${lines} lines)`);
    }

    // Check agent loop for message-based operations
    if (!agentLoopRef) {
      return error("OPERATION_NOT_ALLOWED", "No active conversation", [
        "Start a conversation first, then use /copy to copy messages.",
      ]);
    }

    const messages = agentLoopRef.getMessages();

    if (messages.length === 0) {
      return error("RESOURCE_NOT_FOUND", "No messages in conversation", [
        "The conversation is empty. Send a message first.",
      ]);
    }

    // Handle 'last' - copy last assistant message
    if (target === "last") {
      const lastMessage = getLastAssistantMessage(messages);

      if (!lastMessage) {
        return error("RESOURCE_NOT_FOUND", "No assistant message found", [
          "No assistant messages in the current conversation.",
        ]);
      }

      const copyResult = await copy(lastMessage, "last message");
      if (!copyResult.success) {
        return error("INTERNAL_ERROR", copyResult.error);
      }

      const preview =
        lastMessage.length > 60
          ? `${lastMessage.slice(0, 57)}...`
          : lastMessage.replace(/\n/g, "↵");

      return success(
        `📋 Copied last message (${lastMessage.length} chars)\n   Preview: ${preview}`
      );
    }

    // Handle 'code' - copy last code block
    if (target === "code") {
      const codeBlock = getLastCodeBlock(messages);

      if (!codeBlock) {
        return error("RESOURCE_NOT_FOUND", "No code block found", [
          "No code blocks found in the conversation.",
          "Code blocks are detected by ``` fences.",
        ]);
      }

      const copyResult = await copy(codeBlock.code, `code: ${codeBlock.language}`);
      if (!copyResult.success) {
        return error("INTERNAL_ERROR", copyResult.error);
      }

      const lines = codeBlock.code.split("\n").length;
      const lang = codeBlock.language || "text";

      return success(`📋 Copied ${lang} code block (${lines} lines)`);
    }

    // Unknown target
    return error("INVALID_ARGUMENT", `Unknown copy target: ${target}`, [
      "Valid targets: last, code, file",
      "",
      "Examples:",
      "  /copy last        Copy last assistant message",
      "  /copy code        Copy last code block",
      "  /copy file <path> Copy file contents",
    ]);
  },
};

// =============================================================================
// Exports
// =============================================================================

export default copyCommand;
