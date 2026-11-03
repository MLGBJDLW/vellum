import { sanitize } from "../../utils/textSanitizer.js";

/** Offer only an explicit next step from the latest completed assistant reply.
 * No extra model request, polling, or speculative task is created.
 */
export function getNextStepSuggestion(
  messages: readonly {
    role: string;
    content: string;
    isStreaming?: boolean;
  }[]
): string | undefined {
  const last = messages.at(-1);
  if (last?.role !== "assistant" || last.isStreaming) return undefined;
  // Only inspect the tail, keeping render work bounded for long responses.
  const tail = sanitize(last.content.slice(-4000), { stripAllAnsi: true });
  const matches = [
    ...tail.matchAll(
      /(?:^|\n)\s*(?:[-*]\s*)?(?:Next step|Next|下一步|接下来)\s*[:：]\s*([^\n]+)/gi
    ),
  ];
  const suggestion = matches
    .at(-1)?.[1]
    ?.replace(/\*\*|`/g, "")
    .trim();
  return suggestion && suggestion.length <= 180 ? suggestion : undefined;
}
