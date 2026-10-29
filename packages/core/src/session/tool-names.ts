import { createHash } from "node:crypto";
import type { CompletionMessage, ToolDefinition } from "@vellum/provider";

/** Adapt names at the transport boundary; registry and persisted history keep their identity. */
export function prepareToolNames(
  tools: ToolDefinition[] | undefined,
  messages: CompletionMessage[],
  extraBody?: Record<string, unknown>
) {
  const names = new Set(tools?.map((tool) => tool.name));
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) if (part.type === "tool_use") names.add(part.name);
  }
  // Conservative common subset for OpenAI, Anthropic and Google function names.
  const valid = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
  const used = new Set([...names].filter((name) => valid.test(name)));
  const toWire = new Map<string, string>();
  const fromWire = new Map<string, string>();
  for (const name of [...names].sort()) {
    let wire = name;
    if (!valid.test(name)) {
      const prefix = `tool_${name.replace(/[^A-Za-z0-9_-]/g, "_")}`.slice(0, 47);
      let attempt = 0;
      do {
        const digest = createHash("sha256")
          .update(`${name}\0${attempt++}`)
          .digest("hex")
          .slice(0, 16);
        wire = `${prefix}_${digest}`;
      } while (used.has(wire));
    }
    used.add(wire);
    toWire.set(name, wire);
    fromWire.set(wire, name);
  }
  let wireExtraBody = extraBody;
  const choice = extraBody?.tool_choice;
  if (choice && typeof choice === "object" && "function" in choice) {
    const fn = choice.function;
    if (fn && typeof fn === "object" && "name" in fn && typeof fn.name === "string") {
      wireExtraBody = {
        ...extraBody,
        tool_choice: { ...choice, function: { ...fn, name: toWire.get(fn.name) ?? fn.name } },
      };
    }
  }
  return {
    extraBody: wireExtraBody,
    tools: tools?.map((tool) => ({ ...tool, name: toWire.get(tool.name) ?? tool.name })),
    messages: messages.map((message) => ({
      ...message,
      content: Array.isArray(message.content)
        ? message.content.map((part) =>
            part.type === "tool_use" ? { ...part, name: toWire.get(part.name) ?? part.name } : part
          )
        : message.content,
    })),
    restore: (name: string) => fromWire.get(name) ?? name,
  };
}
