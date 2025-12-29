/**
 * Ask Followup Question Tool
 *
 * Prompts the user for additional input during agent execution.
 *
 * @module builtin/ask-followup
 */

import { z } from "zod";

import { defineTool, fail, ok } from "../types/index.js";

/**
 * Schema for ask_followup_question tool parameters
 */
export const askFollowupQuestionParamsSchema = z.object({
  /** Question to ask the user */
  question: z.string().describe("The question to ask the user"),
  /** Optional suggestions to show the user */
  suggestions: z
    .array(z.string())
    .optional()
    .describe("Optional list of suggested answers to show the user"),
});

/** Inferred type for ask_followup_question parameters */
export type AskFollowupQuestionParams = z.infer<typeof askFollowupQuestionParamsSchema>;

/** Output type for ask_followup_question tool */
export interface AskFollowupQuestionOutput {
  /** The user's response */
  response: string;
  /** Whether a suggestion was selected */
  selectedSuggestion: boolean;
  /** Index of selected suggestion (if applicable) */
  suggestionIndex?: number;
  /** Whether the user cancelled the prompt */
  cancelled: boolean;
}

/**
 * Signal type for user prompting
 *
 * The actual user interaction is handled by the agent loop/TUI.
 * This output signals that user input is needed.
 */
export interface UserPromptSignal {
  /** Type of signal */
  type: "user_prompt";
  /** Question to display */
  question: string;
  /** Optional suggestions */
  suggestions?: string[];
}

/**
 * Ask followup question tool implementation
 *
 * Signals that the agent needs user input to continue.
 * The actual prompting is handled by the agent loop/TUI layer.
 *
 * Note: This tool returns a signal that pauses the agent loop.
 * The TUI/CLI layer handles the actual user interaction and
 * provides the response back to the agent.
 *
 * @example
 * ```typescript
 * // Simple question
 * const result = await askFollowupQuestionTool.execute(
 *   { question: "Which database should I use for this project?" },
 *   ctx
 * );
 *
 * // Question with suggestions
 * const result = await askFollowupQuestionTool.execute(
 *   {
 *     question: "Which testing framework do you prefer?",
 *     suggestions: ["Jest", "Vitest", "Mocha"]
 *   },
 *   ctx
 * );
 * ```
 */
export const askFollowupQuestionTool = defineTool({
  name: "ask_followup_question",
  description:
    "Ask the user a follow-up question when you need more information to complete the task. Optionally provide suggestions.",
  parameters: askFollowupQuestionParamsSchema,
  kind: "agent",
  category: "agent",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // Validate question is not empty
    if (!input.question.trim()) {
      return fail("Question cannot be empty");
    }

    // This tool works differently than others:
    // It returns a special signal that the agent loop interprets
    // to pause and prompt the user.
    //
    // The actual user response comes from the TUI/CLI layer,
    // not from this function. This just signals the intent.
    //
    // For now, we return a placeholder that the agent loop will intercept.
    // In a real implementation, this would integrate with the TUI's
    // prompt system.

    // The agent loop will:
    // 1. See this tool was called
    // 2. Display the question to the user
    // 3. Wait for user input
    // 4. Return the response as a tool result

    // For testing/mock purposes, return a signal structure
    // The actual implementation will be handled by the agent loop
    return ok({
      // Signal that we're waiting for user input
      // This gets processed by the agent loop
      response: "__WAITING_FOR_USER_INPUT__",
      selectedSuggestion: false,
      cancelled: false,
      // Include the prompt data for the agent loop to use
      _prompt: {
        type: "user_prompt" as const,
        question: input.question,
        suggestions: input.suggestions,
      },
    } as AskFollowupQuestionOutput & { _prompt: UserPromptSignal });
  },

  shouldConfirm(_input, _ctx) {
    // Asking questions doesn't need confirmation
    return false;
  },
});
