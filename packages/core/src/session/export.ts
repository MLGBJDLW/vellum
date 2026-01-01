// ============================================
// Export Service
// ============================================

/**
 * Session export service for converting sessions to various formats.
 *
 * Supports export to JSON, Markdown, HTML, and plain text formats
 * with configurable options for metadata, tool outputs, and timestamps.
 *
 * @module @vellum/core/session/export
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { format as formatDate } from "date-fns";
import type { SessionMessage, SessionMessagePart } from "./message.js";
import type { Session } from "./types.js";

// =============================================================================
// Export Format Types
// =============================================================================

/**
 * Supported export formats
 *
 * - `json`: Pretty-printed JSON with full session data
 * - `markdown`: Formatted Markdown with role emojis
 * - `html`: Self-contained HTML document with styling
 * - `text`: Plain text with role prefixes
 */
export type ExportFormat = "json" | "markdown" | "html" | "text";

// =============================================================================
// Export Options
// =============================================================================

/**
 * Options for customizing session export
 */
export interface ExportOptions {
  /** Output format */
  format: ExportFormat;
  /** Include session metadata (default: true) */
  includeMetadata?: boolean;
  /** Include tool call/result outputs (default: true) */
  includeToolOutputs?: boolean;
  /** Include message timestamps (default: true) */
  includeTimestamps?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Role emoji mapping for Markdown/HTML */
const ROLE_EMOJIS: Record<string, string> = {
  user: "👤",
  assistant: "🤖",
  system: "⚙️",
  tool_result: "🔧",
};

/** Role display names */
const ROLE_NAMES: Record<string, string> = {
  user: "User",
  assistant: "Assistant",
  system: "System",
  tool_result: "Tool",
};

/** HTML color scheme for roles */
const ROLE_COLORS = {
  user: { bg: "#e3f2fd", border: "#1976d2", text: "#0d47a1" },
  assistant: { bg: "#f3e5f5", border: "#7b1fa2", text: "#4a148c" },
  system: { bg: "#fff3e0", border: "#f57c00", text: "#e65100" },
  tool_result: { bg: "#e8f5e9", border: "#388e3c", text: "#1b5e20" },
};

/** Default export options */
const DEFAULT_OPTIONS: Required<Omit<ExportOptions, "format">> = {
  includeMetadata: true,
  includeToolOutputs: true,
  includeTimestamps: true,
};

// =============================================================================
// Export Service
// =============================================================================

/**
 * Service for exporting sessions to various formats.
 *
 * @example
 * ```typescript
 * const exportService = new ExportService();
 *
 * // Export to Markdown
 * const markdown = exportService.export(session, { format: 'markdown' });
 *
 * // Export to file
 * await exportService.exportToFile(session, { format: 'json' }, './session.json');
 * ```
 */
export class ExportService {
  /**
   * Export a session to the specified format.
   *
   * @param session - The session to export
   * @param options - Export options including format
   * @returns Formatted string representation of the session
   */
  export(session: Session, options: ExportOptions): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    switch (opts.format) {
      case "json":
        return this.exportJson(session, opts);
      case "markdown":
        return this.exportMarkdown(session, opts);
      case "html":
        return this.exportHtml(session, opts);
      case "text":
        return this.exportText(session, opts);
      default:
        throw new Error(`Unsupported export format: ${opts.format}`);
    }
  }

  /**
   * Export a session to a file.
   *
   * @param session - The session to export
   * @param options - Export options including format
   * @param filePath - Path to save the exported file
   */
  async exportToFile(session: Session, options: ExportOptions, filePath: string): Promise<void> {
    const content = this.export(session, options);
    const dir = path.dirname(filePath);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  }

  /**
   * Format a single message for the specified format.
   *
   * @param message - The message to format
   * @param format - The output format
   * @param options - Export options
   * @returns Formatted message string
   */
  formatMessage(
    message: SessionMessage,
    format: ExportFormat,
    options?: Partial<ExportOptions>
  ): string {
    const opts = { ...DEFAULT_OPTIONS, ...options, format };

    switch (format) {
      case "json":
        return JSON.stringify(message, null, 2);
      case "markdown":
        return this.formatMessageMarkdown(message, opts);
      case "html":
        return this.formatMessageHtml(message, opts);
      case "text":
        return this.formatMessageText(message, opts);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // ===========================================================================
  // JSON Export
  // ===========================================================================

  private exportJson(session: Session, opts: Required<Omit<ExportOptions, "format">>): string {
    // For JSON, we export the full session object with optional filtering
    const exportData = this.prepareExportData(session, opts);
    return JSON.stringify(exportData, null, 2);
  }

  private prepareExportData(
    session: Session,
    opts: Required<Omit<ExportOptions, "format">>
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    if (opts.includeMetadata) {
      data.metadata = session.metadata;
    }

    data.messages = session.messages.map((msg) => {
      const messageCopy: Record<string, unknown> = {
        id: msg.id,
        role: msg.role,
        parts: opts.includeToolOutputs
          ? msg.parts
          : msg.parts.filter((p) => p.type !== "tool" && p.type !== "tool_result"),
      };

      if (opts.includeTimestamps) {
        messageCopy.metadata = msg.metadata;
      } else {
        // Exclude timestamp-related fields
        const { createdAt, completedAt, ...rest } = msg.metadata;
        messageCopy.metadata = rest;
      }

      return messageCopy;
    });

    if (opts.includeMetadata && session.checkpoints.length > 0) {
      data.checkpoints = session.checkpoints;
    }

    return data;
  }

  // ===========================================================================
  // Markdown Export
  // ===========================================================================

  private exportMarkdown(session: Session, opts: Required<Omit<ExportOptions, "format">>): string {
    const lines: string[] = [];

    // Title
    lines.push(`# ${session.metadata.title}`);
    lines.push("");

    // Metadata as frontmatter-style table
    if (opts.includeMetadata) {
      lines.push("## Session Info");
      lines.push("");
      lines.push("| Property | Value |");
      lines.push("|----------|-------|");
      lines.push(`| **ID** | \`${session.metadata.id}\` |`);
      lines.push(`| **Status** | ${session.metadata.status} |`);
      lines.push(`| **Mode** | ${session.metadata.mode} |`);
      lines.push(
        `| **Created** | ${formatDate(session.metadata.createdAt, "yyyy-MM-dd HH:mm:ss")} |`
      );
      lines.push(
        `| **Updated** | ${formatDate(session.metadata.updatedAt, "yyyy-MM-dd HH:mm:ss")} |`
      );
      lines.push(`| **Messages** | ${session.metadata.messageCount} |`);
      lines.push(`| **Tokens** | ${session.metadata.tokenCount.toLocaleString()} |`);
      if (session.metadata.tags.length > 0) {
        lines.push(`| **Tags** | ${session.metadata.tags.map((t) => `\`${t}\``).join(", ")} |`);
      }
      if (session.metadata.summary) {
        lines.push(`| **Summary** | ${session.metadata.summary} |`);
      }
      lines.push("");
    }

    // Messages
    lines.push("## Messages");
    lines.push("");

    for (const message of session.messages) {
      lines.push(this.formatMessageMarkdown(message, opts));
      lines.push("");
    }

    return lines.join("\n");
  }

  private formatMessageMarkdown(
    message: SessionMessage,
    opts: Required<Omit<ExportOptions, "format">>
  ): string {
    const lines: string[] = [];
    const emoji = ROLE_EMOJIS[message.role] ?? "💬";
    const roleName = ROLE_NAMES[message.role] ?? message.role;

    // Message header with optional timestamp
    let header = `### ${emoji} ${roleName}`;
    if (opts.includeTimestamps) {
      const timestamp = formatDate(new Date(message.metadata.createdAt), "HH:mm:ss");
      header += ` _(${timestamp})_`;
    }
    lines.push(header);
    lines.push("");

    // Message parts
    for (const part of message.parts) {
      const partContent = this.formatPartMarkdown(part, opts);
      if (partContent) {
        lines.push(partContent);
        lines.push("");
      }
    }

    return lines.join("\n").trim();
  }

  private formatPartMarkdown(
    part: SessionMessagePart,
    opts: Required<Omit<ExportOptions, "format">>
  ): string {
    switch (part.type) {
      case "text":
        return part.text;

      case "tool":
        if (!opts.includeToolOutputs) return "";
        return [
          `**Tool Call:** \`${part.name}\``,
          "",
          "```json",
          JSON.stringify(part.input, null, 2),
          "```",
        ].join("\n");

      case "tool_result": {
        if (!opts.includeToolOutputs) return "";
        const resultContent =
          typeof part.content === "string" ? part.content : JSON.stringify(part.content, null, 2);
        const prefix = part.isError ? "❌ **Error:**" : "✅ **Result:**";
        return [
          prefix,
          "",
          "```",
          resultContent.length > 1000
            ? `${resultContent.slice(0, 1000)}...[truncated]`
            : resultContent,
          "```",
        ].join("\n");
      }

      case "reasoning":
        return [
          "<details>",
          "<summary>💭 Thinking...</summary>",
          "",
          part.text,
          "",
          "</details>",
        ].join("\n");

      case "file":
        return `📎 **File:** [${part.filename ?? part.url}](${part.url})`;

      case "image":
        return `🖼️ **Image:** ![image](${part.source})`;

      default:
        return "";
    }
  }

  // ===========================================================================
  // HTML Export
  // ===========================================================================

  private exportHtml(session: Session, opts: Required<Omit<ExportOptions, "format">>): string {
    const styles = this.getHtmlStyles();
    const body = this.buildHtmlBody(session, opts);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(session.metadata.title)}</title>
  <style>
${styles}
  </style>
</head>
<body>
  <div class="container">
${body}
  </div>
  <script>
    // Toggle collapsible sections
    document.querySelectorAll('.collapsible-header').forEach(header => {
      header.addEventListener('click', () => {
        const content = header.nextElementSibling;
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        header.classList.toggle('collapsed', !isHidden);
      });
    });
  </script>
</body>
</html>`;
  }

  private getHtmlStyles(): string {
    return `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      color: #1a1a1a;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #ddd;
    }
    .metadata {
      background: white;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .metadata h2 {
      font-size: 1.1em;
      margin-bottom: 12px;
      color: #666;
    }
    .metadata-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }
    .metadata-item {
      padding: 8px;
      background: #f9f9f9;
      border-radius: 4px;
    }
    .metadata-item label {
      font-size: 0.85em;
      color: #666;
      display: block;
    }
    .metadata-item span {
      font-weight: 500;
    }
    .messages {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .message {
      background: white;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-left: 4px solid #ddd;
    }
    .message.user { border-left-color: ${ROLE_COLORS.user.border}; background: ${ROLE_COLORS.user.bg}; }
    .message.assistant { border-left-color: ${ROLE_COLORS.assistant.border}; background: ${ROLE_COLORS.assistant.bg}; }
    .message.system { border-left-color: ${ROLE_COLORS.system.border}; background: ${ROLE_COLORS.system.bg}; }
    .message.tool_result { border-left-color: ${ROLE_COLORS.tool_result.border}; background: ${ROLE_COLORS.tool_result.bg}; }
    .message-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      font-weight: 600;
    }
    .message-header .emoji {
      font-size: 1.2em;
    }
    .message-header .role {
      color: #333;
    }
    .message-header .timestamp {
      margin-left: auto;
      font-weight: normal;
      font-size: 0.85em;
      color: #666;
    }
    .message-content {
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .tool-call, .tool-result {
      margin-top: 12px;
      border-radius: 4px;
      overflow: hidden;
    }
    .collapsible-header {
      background: #eee;
      padding: 8px 12px;
      cursor: pointer;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .collapsible-header:hover {
      background: #e0e0e0;
    }
    .collapsible-header::before {
      content: '▼';
      font-size: 0.8em;
      transition: transform 0.2s;
    }
    .collapsible-header.collapsed::before {
      transform: rotate(-90deg);
    }
    .collapsible-content {
      background: #f9f9f9;
      padding: 12px;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.9em;
      overflow-x: auto;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    code {
      background: #e8e8e8;
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 0.9em;
    }
    .error {
      color: #c62828;
    }
    .thinking {
      font-style: italic;
      color: #666;
      padding: 8px;
      background: #fff8e1;
      border-radius: 4px;
      margin-top: 8px;
    }
    .file-attachment, .image-attachment {
      display: inline-block;
      padding: 8px 12px;
      background: #e3f2fd;
      border-radius: 4px;
      margin-top: 8px;
    }
    .tags {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .tag {
      background: #e0e0e0;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.85em;
    }
    `;
  }

  private buildHtmlBody(session: Session, opts: Required<Omit<ExportOptions, "format">>): string {
    const lines: string[] = [];

    // Title
    lines.push(`    <h1>${this.escapeHtml(session.metadata.title)}</h1>`);

    // Metadata
    if (opts.includeMetadata) {
      lines.push(`    <div class="metadata">`);
      lines.push(`      <h2>Session Info</h2>`);
      lines.push(`      <div class="metadata-grid">`);
      lines.push(this.buildMetadataItem("ID", session.metadata.id));
      lines.push(this.buildMetadataItem("Status", session.metadata.status));
      lines.push(this.buildMetadataItem("Mode", session.metadata.mode));
      lines.push(
        this.buildMetadataItem(
          "Created",
          formatDate(session.metadata.createdAt, "yyyy-MM-dd HH:mm:ss")
        )
      );
      lines.push(
        this.buildMetadataItem(
          "Updated",
          formatDate(session.metadata.updatedAt, "yyyy-MM-dd HH:mm:ss")
        )
      );
      lines.push(this.buildMetadataItem("Messages", session.metadata.messageCount.toString()));
      lines.push(this.buildMetadataItem("Tokens", session.metadata.tokenCount.toLocaleString()));
      if (session.metadata.tags.length > 0) {
        const tagsHtml = session.metadata.tags
          .map((t) => `<span class="tag">${this.escapeHtml(t)}</span>`)
          .join("");
        lines.push(
          `        <div class="metadata-item"><label>Tags</label><div class="tags">${tagsHtml}</div></div>`
        );
      }
      lines.push(`      </div>`);
      if (session.metadata.summary) {
        lines.push(
          `      <div class="metadata-item" style="margin-top: 12px"><label>Summary</label><span>${this.escapeHtml(session.metadata.summary)}</span></div>`
        );
      }
      lines.push(`    </div>`);
    }

    // Messages
    lines.push(`    <div class="messages">`);
    for (const message of session.messages) {
      lines.push(this.formatMessageHtml(message, opts));
    }
    lines.push(`    </div>`);

    return lines.join("\n");
  }

  private buildMetadataItem(label: string, value: string): string {
    return `        <div class="metadata-item"><label>${label}</label><span>${this.escapeHtml(value)}</span></div>`;
  }

  private formatMessageHtml(
    message: SessionMessage,
    opts: Required<Omit<ExportOptions, "format">>
  ): string {
    const lines: string[] = [];
    const emoji = ROLE_EMOJIS[message.role] ?? "💬";
    const roleName = ROLE_NAMES[message.role] ?? message.role;

    lines.push(`      <div class="message ${message.role}">`);
    lines.push(`        <div class="message-header">`);
    lines.push(`          <span class="emoji">${emoji}</span>`);
    lines.push(`          <span class="role">${roleName}</span>`);
    if (opts.includeTimestamps) {
      const timestamp = formatDate(new Date(message.metadata.createdAt), "HH:mm:ss");
      lines.push(`          <span class="timestamp">${timestamp}</span>`);
    }
    lines.push(`        </div>`);
    lines.push(`        <div class="message-content">`);

    // Message parts
    for (const part of message.parts) {
      const partHtml = this.formatPartHtml(part, opts);
      if (partHtml) {
        lines.push(partHtml);
      }
    }

    lines.push(`        </div>`);
    lines.push(`      </div>`);

    return lines.join("\n");
  }

  private formatPartHtml(
    part: SessionMessagePart,
    opts: Required<Omit<ExportOptions, "format">>
  ): string {
    switch (part.type) {
      case "text":
        return `          ${this.escapeHtml(part.text)}`;

      case "tool": {
        if (!opts.includeToolOutputs) return "";
        const inputJson = JSON.stringify(part.input, null, 2);
        return `
          <div class="tool-call">
            <div class="collapsible-header">
              🔧 Tool Call: <code>${this.escapeHtml(part.name)}</code>
            </div>
            <div class="collapsible-content">
              <pre>${this.escapeHtml(inputJson)}</pre>
            </div>
          </div>`;
      }

      case "tool_result": {
        if (!opts.includeToolOutputs) return "";
        const resultContent =
          typeof part.content === "string" ? part.content : JSON.stringify(part.content, null, 2);
        const truncated =
          resultContent.length > 1000
            ? `${resultContent.slice(0, 1000)}...[truncated]`
            : resultContent;
        const errorClass = part.isError ? " error" : "";
        const icon = part.isError ? "❌" : "✅";
        return `
          <div class="tool-result">
            <div class="collapsible-header${errorClass}">
              ${icon} Tool Result
            </div>
            <div class="collapsible-content">
              <pre${errorClass ? ' class="error"' : ""}>${this.escapeHtml(truncated)}</pre>
            </div>
          </div>`;
      }

      case "reasoning":
        return `
          <div class="thinking">
            💭 <em>${this.escapeHtml(part.text)}</em>
          </div>`;

      case "file":
        return `
          <div class="file-attachment">
            📎 <a href="${this.escapeHtml(part.url)}">${this.escapeHtml(part.filename ?? part.url)}</a>
          </div>`;

      case "image":
        return `
          <div class="image-attachment">
            <img src="${this.escapeHtml(part.source)}" alt="Image attachment" style="max-width: 100%; max-height: 400px;" />
          </div>`;

      default:
        return "";
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ===========================================================================
  // Text Export
  // ===========================================================================

  private exportText(session: Session, opts: Required<Omit<ExportOptions, "format">>): string {
    const lines: string[] = [];
    const separator = "─".repeat(60);

    // Title
    lines.push(session.metadata.title);
    lines.push("=".repeat(session.metadata.title.length));
    lines.push("");

    // Metadata
    if (opts.includeMetadata) {
      lines.push("SESSION INFO");
      lines.push("-".repeat(12));
      lines.push(`ID:       ${session.metadata.id}`);
      lines.push(`Status:   ${session.metadata.status}`);
      lines.push(`Mode:     ${session.metadata.mode}`);
      lines.push(`Created:  ${formatDate(session.metadata.createdAt, "yyyy-MM-dd HH:mm:ss")}`);
      lines.push(`Updated:  ${formatDate(session.metadata.updatedAt, "yyyy-MM-dd HH:mm:ss")}`);
      lines.push(`Messages: ${session.metadata.messageCount}`);
      lines.push(`Tokens:   ${session.metadata.tokenCount.toLocaleString()}`);
      if (session.metadata.tags.length > 0) {
        lines.push(`Tags:     ${session.metadata.tags.join(", ")}`);
      }
      if (session.metadata.summary) {
        lines.push(`Summary:  ${session.metadata.summary}`);
      }
      lines.push("");
      lines.push(separator);
      lines.push("");
    }

    // Messages
    lines.push("MESSAGES");
    lines.push("-".repeat(8));
    lines.push("");

    for (const message of session.messages) {
      lines.push(this.formatMessageText(message, opts));
      lines.push(separator);
      lines.push("");
    }

    return lines.join("\n");
  }

  private formatMessageText(
    message: SessionMessage,
    opts: Required<Omit<ExportOptions, "format">>
  ): string {
    const lines: string[] = [];
    const roleName = ROLE_NAMES[message.role] ?? message.role;

    // Message header with optional timestamp
    let header = `[${roleName}]`;
    if (opts.includeTimestamps) {
      const timestamp = formatDate(new Date(message.metadata.createdAt), "HH:mm:ss");
      header += ` (${timestamp})`;
    }
    lines.push(header);
    lines.push("");

    // Message parts
    for (const part of message.parts) {
      const partContent = this.formatPartText(part, opts);
      if (partContent) {
        lines.push(partContent);
        lines.push("");
      }
    }

    return lines.join("\n").trim();
  }

  private formatPartText(
    part: SessionMessagePart,
    opts: Required<Omit<ExportOptions, "format">>
  ): string {
    switch (part.type) {
      case "text":
        return part.text;

      case "tool":
        if (!opts.includeToolOutputs) return "";
        return [`[Tool Call: ${part.name}]`, JSON.stringify(part.input, null, 2)].join("\n");

      case "tool_result": {
        if (!opts.includeToolOutputs) return "";
        const resultContent =
          typeof part.content === "string" ? part.content : JSON.stringify(part.content, null, 2);
        const prefix = part.isError ? "[Error]" : "[Result]";
        const truncated =
          resultContent.length > 1000
            ? `${resultContent.slice(0, 1000)}...[truncated]`
            : resultContent;
        return `${prefix}\n${truncated}`;
      }

      case "reasoning":
        return `[Thinking]\n${part.text}`;

      case "file":
        return `[File: ${part.filename ?? part.url}]`;

      case "image":
        return `[Image: ${part.source}]`;

      default:
        return "";
    }
  }
}
