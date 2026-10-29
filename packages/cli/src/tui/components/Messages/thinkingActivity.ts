import stringWidth from "string-width";
import { sanitize } from "../../utils/textSanitizer.js";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Bound a title by terminal cells without splitting CJK or emoji graphemes. */
function fitTitle(title: string, maxWidth: number): string {
  const width = Math.max(0, Math.floor(maxWidth));
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

/** Only classify explicit activity phrases; arbitrary reasoning stays in the
 * expanded view. These labels describe provider text, not tool execution.
 */
function summarizeActivity(text: string): string | undefined {
  const phrase = text.replace(/^(?:I(?:'m| am)\s+|Now\s+)/i, "");
  if (/^(?:I (?:need|should|will)|Let(?:'s| me)|Planning|Considering next)\b/i.test(phrase)) {
    return "Planning next steps";
  }
  if (/^(?:Checking|Verifying|Testing|Validating)\b/i.test(phrase)) return "Checking the approach";
  if (/^(?:Reading|Inspecting|Reviewing|Examining)\b/i.test(phrase)) return "Reviewing context";
  if (/^(?:Comparing|Evaluating|Weighing)\b/i.test(phrase)) return "Comparing approaches";
  if (/^(?:Writing|Drafting|Preparing|Summarizing)\b/i.test(phrase))
    return "Preparing the response";
  if (/^(?:Analyzing|Investigating|Understanding)\b/i.test(phrase)) return "Analyzing the request";
  if (/^(?:正在)?(?:检查|验证|测试)/u.test(phrase)) return "检查方案";
  if (/^(?:正在)?(?:阅读|查看|审查|检查代码)/u.test(phrase)) return "查看上下文";
  if (/^(?:正在)?(?:分析|研究|理解)/u.test(phrase)) return "分析问题";
  if (/^(?:正在)?(?:比较|评估)/u.test(phrase)) return "比较方案";
  if (/^(?:正在)?(?:整理|撰写|总结)/u.test(phrase)) return "整理回答";
  if (/^(?:我需要|接下来|计划)/u.test(phrase)) return "规划下一步";
  return undefined;
}

/** Latest complete provider heading, otherwise a conservative activity label.
 * Incomplete streaming lines and fenced code never become UI title fragments.
 * This only derives presentation text; it never modifies the provider content.
 */
export function getThinkingActivity(content: string, isStreaming: boolean, maxWidth = 56): string {
  const lines = sanitize(content, { stripAllAnsi: true }).split("\n");
  let heading: string | undefined;
  let activity: string | undefined;
  let fence: string | undefined;

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    const fenceMatch = /^(?:`{3,}|~{3,})/.exec(line)?.[0];
    if (fenceMatch) {
      if (!fence) fence = fenceMatch;
      else if (fenceMatch[0] === fence[0] && fenceMatch.length >= fence.length) fence = undefined;
      continue;
    }
    if (fence || !line) continue;

    const completeLine = !isStreaming || index < lines.length - 1;
    // Closing bold delimiters are an explicit boundary even before a newline.
    const boldHeading = /^(?:\*\*([^*]+)\*\*|__([^_]+)__):?$/.exec(line);
    const markdownHeading = completeLine ? /^#{1,6}\s+(.+?)(?:\s+#+)?$/.exec(line) : null;
    const candidate = boldHeading?.[1] ?? boldHeading?.[2] ?? markdownHeading?.[1];
    if (candidate && candidate.length <= 160 && !candidate.includes("\u001b")) {
      heading = candidate
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
    } else if (completeLine && !/^[#*`_]/.test(line)) {
      activity = summarizeActivity(line) ?? activity;
    }
  }

  return fitTitle(
    heading || activity || (isStreaming ? "Working through the request" : "Reasoning complete"),
    maxWidth
  );
}
