/**
 * @deprecated Use `Role` from `@vellum/core` instead.
 * The new Role type uses Zod schema validation and includes "tool_result".
 *
 * @example
 * // Old (deprecated):
 * import { MessageRole } from '@vellum/shared';
 *
 * // New:
 * import { Role } from '@vellum/core';
 */
export type MessageRole = "user" | "assistant" | "system" | "tool";

/**
 * @deprecated Use `Message` from `@vellum/core` instead.
 * The new Message type supports multi-part content (text, tool calls,
 * tool results, files, images, reasoning) instead of plain string content.
 *
 * @example
 * // Old (deprecated):
 * import { Message } from '@vellum/shared';
 * const msg: Message = { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() };
 *
 * // New:
 * import { Message, createMessage, Parts } from '@vellum/core';
 * const msg = createMessage('user', [Parts.text('Hello')]);
 *
 * @see {@link https://github.com/vellum/docs/blob/main/MIGRATION.md} Migration Guide
 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
