import type { SessionListService, StorageManager } from "@vellum/core";

import type { SessionLookupResult } from "./resume.js";
import { findSessionById, SHORT_ID_LENGTH } from "./resume.js";

export function formatDisplayDate(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return Number.isNaN(value.getTime()) ? String(date) : value.toLocaleString();
}

export function truncateText(text: string, maxLength = 96): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

export async function findArchivedSessionById(
  storage: StorageManager,
  id: string
): Promise<SessionLookupResult> {
  try {
    const session = await storage.loadArchivedSession(id);
    return { ok: true, session };
  } catch {
    // Fall through to short-id lookup.
  }

  if (id.length <= SHORT_ID_LENGTH) {
    const archivedSessions = await storage.getArchivedSessions();
    const matches = archivedSessions.filter((session) =>
      session.id.toLowerCase().startsWith(id.toLowerCase())
    );

    if (matches.length === 0) {
      return { ok: false, error: `Archived session not found: ${id}` };
    }

    if (matches.length > 1) {
      const matchList = matches
        .slice(0, 5)
        .map((session) => `  ${session.id.slice(0, SHORT_ID_LENGTH)} - ${session.title}`);

      return {
        ok: false,
        error: `Multiple archived sessions match "${id}":\n${matchList.join("\n")}\nUse a longer ID to disambiguate.`,
      };
    }

    const match = matches[0];
    if (!match) {
      return { ok: false, error: `Archived session not found: ${id}` };
    }

    try {
      const session = await storage.loadArchivedSession(match.id);
      return { ok: true, session };
    } catch {
      return {
        ok: false,
        error: "Archived session is corrupted and could not be loaded.",
      };
    }
  }

  return { ok: false, error: `Archived session not found: ${id}` };
}

export async function resolveSessionReference(options: {
  storage: StorageManager;
  listService: SessionListService;
  sessionId: string;
  archived?: boolean;
}): Promise<SessionLookupResult> {
  const { archived, listService, sessionId, storage } = options;

  if (archived) {
    return findArchivedSessionById(storage, sessionId);
  }

  return findSessionById(sessionId, { storage, listService });
}
