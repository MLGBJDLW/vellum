import type { Session } from "./types.js";

export interface MergeOptions {
  prefer?: "primary" | "secondary";
}

export function mergeSessions(
  primary: Session,
  secondary: Session,
  options: MergeOptions = {}
): Session {
  const prefer = options.prefer ?? "primary";
  const base = prefer === "secondary" ? secondary : primary;
  const other = prefer === "secondary" ? primary : secondary;

  const messages = [...base.messages, ...other.messages];
  const checkpoints = [...base.checkpoints, ...other.checkpoints];

  const createdAt =
    base.metadata.createdAt < other.metadata.createdAt
      ? base.metadata.createdAt
      : other.metadata.createdAt;
  const updatedAt =
    base.metadata.updatedAt > other.metadata.updatedAt
      ? base.metadata.updatedAt
      : other.metadata.updatedAt;
  const lastActive =
    base.metadata.lastActive > other.metadata.lastActive
      ? base.metadata.lastActive
      : other.metadata.lastActive;

  return {
    metadata: {
      ...base.metadata,
      createdAt,
      updatedAt,
      lastActive,
      messageCount: messages.length,
      tokenCount: base.metadata.tokenCount + other.metadata.tokenCount,
      tags: Array.from(new Set([...base.metadata.tags, ...other.metadata.tags])),
      summary: base.metadata.summary ?? other.metadata.summary,
    },
    messages,
    checkpoints,
  };
}
