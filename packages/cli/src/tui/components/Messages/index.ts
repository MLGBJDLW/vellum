/**
 * Message Components
 *
 * Components for displaying messages and conversation history in the Vellum TUI.
 */

export { CodeBlock, type CodeBlockProps } from "./CodeBlock.js";
export { DiffView, type DiffViewProps } from "./DiffView.js";
export { MarkdownBlock, type MarkdownBlockProps, MarkdownBlockSync } from "./MarkdownBlock.js";
export { MarkdownRenderer, type MarkdownRendererProps } from "./MarkdownRenderer.js";
export { MessageBubble, type MessageBubbleProps } from "./MessageBubble.js";
export { MessageList, type MessageListProps } from "./MessageList.js";
export { StreamingText, type StreamingTextProps } from "./StreamingText.js";
export {
  CompactThinkingIndicator,
  type CompactThinkingIndicatorProps,
  ThinkingBlock,
  type ThinkingBlockProps,
} from "./ThinkingBlock.js";
export {
  SHELL_TOOL_MAX_LINES,
  TOOL_RESULT_MAX_LINES,
  ToolResultPreview,
  type ToolResultPreviewProps,
} from "./ToolResultPreview.js";
