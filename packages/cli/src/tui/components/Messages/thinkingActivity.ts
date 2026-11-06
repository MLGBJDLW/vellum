import stringWidth from "string-width";
import { sanitize } from "../../utils/textSanitizer.js";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const MAX_PENDING_CHARS = 4096;

/** Bound a title by terminal cells without splitting CJK or emoji graphemes. */
function fitTitle(title: string, maxWidth: number): string {
  const width = Number.isFinite(maxWidth) ? Math.max(0, Math.floor(maxWidth)) : 56;
  if (stringWidth(title) <= width) return title;
  if (width < 2) return width === 1 ? "…" : "";
  let result = "";
  let used = 0;
  for (const { segment } of graphemes.segment(title)) {
    const cells = stringWidth(segment);
    if (used + cells > width - 1) break;
    result += segment;
    used += cells;
  }
  return `${result.trimEnd()}…`;
}

/** Keep the model's concrete action, rather than mapping it to a generic label. */
function actionTitle(text: string): string | undefined {
  const phrase = text
    .replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, "")
    .replace(/^(?:Next(?: step)?|接下来|下一步)\s*[:：]\s*/i, "")
    .trim();
  const isAction =
    /^(?:I(?:'m| am| will| should| need to| plan to)|Let(?:'s| me)|(?:Now[,，]?\s+)?(?:Checking|Verifying|Testing|Validating|Reading|Inspecting|Reviewing|Examining|Comparing|Evaluating|Writing|Drafting|Preparing|Summarizing|Analyzing|Investigating|Understanding|Planning|Updating|Fixing|Implementing|Running|Searching|Check|Verify|Test|Read|Inspect|Review|Compare|Update|Fix|Implement|Run|Search))\b/i.test(
      phrase
    ) ||
    /^(?:正在|我(?:需要|将|会|计划)|接下来|下一步|检查|验证|测试|阅读|查看|审查|分析|研究|理解|比较|评估|整理|撰写|总结|修改|修复|运行|实现|更新)/u.test(
      phrase
    );
  if (!isAction) return undefined;
  const title = phrase
    .replace(/^(?:I(?:'m| am| will| should| need to| plan to)\s+|Now[,，]?\s+)/i, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[.!?。！？]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return title ? title[0]?.toLocaleUpperCase() + title.slice(1) : undefined;
}

function lineTitle(rawLine: string, complete: boolean): string | undefined {
  const line = sanitize(rawLine, { stripAllAnsi: true }).trim();
  if (line.includes("\u001b")) return undefined;
  const bold = /^(?:\*\*([^*]+)\*\*|__([^_]+)__):?$/.exec(line);
  const markdown = complete ? /^#{1,6}\s+(.+?)(?:\s+#+)?$/.exec(line) : null;
  const heading = bold?.[1] ?? bold?.[2] ?? markdown?.[1];
  if (heading && heading.length <= 160) {
    return heading
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (/^[#`_]/.test(line) || line.startsWith("**")) return undefined;

  // A complete sentence is usable before a provider emits its next newline.
  // Never promote a partial token or an unfinished sentence to the header.
  let title: string | undefined;
  let consumed = 0;
  for (const match of line.matchAll(/[.!?。！？](?=\s|$|[\p{Script=Han}])/gu)) {
    const end = (match.index ?? 0) + match[0].length;
    title = actionTitle(line.slice(consumed, end).trim()) ?? title;
    consumed = end;
  }
  if (complete) title = actionTitle(line.slice(consumed).trim()) ?? title;
  return title;
}

/** Incrementally scan appended provider text; only the unfinished line is revisited.
 * No model calls or edits to reasoning content are needed. Oversized prose lines
 * are bounded so a long unbroken response cannot stall every terminal repaint.
 * The caller owns one tracker per append-only message. A bounded boundary check
 * also catches truncation and ordinary replacement without rescanning the prefix;
 * create a new tracker when the message identity changes.
 */
export function createThinkingActivityTracker() {
  let cursor = 0;
  let boundary = "";
  let pending = "";
  let pendingTruncated = false;
  let fence: string | undefined;
  let title: string | undefined;

  return (content: string, isStreaming: boolean, maxWidth = 56): string => {
    if (content.length < cursor || content.slice(Math.max(0, cursor - 128), cursor) !== boundary) {
      cursor = 0;
      boundary = "";
      pending = "";
      pendingTruncated = false;
      fence = undefined;
      title = undefined;
    }
    const delta = content.slice(cursor);
    cursor = content.length;
    boundary = content.slice(Math.max(0, cursor - 128));
    const lines = delta.split("\n");
    for (const [index, part] of lines.entries()) {
      pending += part;
      if (pending.length > MAX_PENDING_CHARS) {
        // Preserve the opening fence even for an exceptionally long code line.
        if (!pendingTruncated && !fence) fence = /^\s*(`{3,}|~{3,})/.exec(pending)?.[1];
        pending = pending.slice(-MAX_PENDING_CHARS);
        pendingTruncated = true;
      }
      const complete = index < lines.length - 1;
      const fenceMatch = !pendingTruncated ? /^\s*(`{3,}|~{3,})/.exec(pending)?.[1] : undefined;
      if (complete) {
        if (fenceMatch) {
          if (!fence) fence = fenceMatch;
          else if (fenceMatch[0] === fence[0] && fenceMatch.length >= fence.length)
            fence = undefined;
        } else if (!fence) {
          const line = pendingTruncated
            ? pending.replace(/^[^.!?。！？]*[.!?。！？]\s*/u, "")
            : pending;
          title = lineTitle(line, true) ?? title;
        }
        pending = "";
        pendingTruncated = false;
      } else if (!fence && !fenceMatch) {
        const line = pendingTruncated
          ? pending.replace(/^[^.!?。！？]*[.!?。！？]\s*/u, "")
          : pending;
        title = lineTitle(line, !isStreaming) ?? title;
      }
    }
    return fitTitle(
      title || (isStreaming ? "Working through the request" : "Reasoning complete"),
      maxWidth
    );
  };
}

/** Stateless entry point for completed text and callers without streaming state. */
export function getThinkingActivity(content: string, isStreaming: boolean, maxWidth = 56): string {
  return createThinkingActivityTracker()(content, isStreaming, maxWidth);
}
