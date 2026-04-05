import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Session, SessionListService, SessionMetadata, StorageManager } from "@vellum/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createArchiveCommand,
  createDeleteCommand,
  createExportCommand,
  createListCommand,
  createSessionCommand,
  createShowCommand,
} from "../session/index.js";
import type {
  CommandContext,
  CommandError,
  CommandInteractive,
  CommandResult,
  CommandSuccess,
  ParsedArgs,
} from "../types.js";

function assertSuccess(result: CommandResult): asserts result is CommandSuccess {
  expect(result.kind).toBe("success");
}

function assertInteractive(result: CommandResult): asserts result is CommandInteractive {
  expect(result.kind).toBe("interactive");
}

function assertError(result: CommandResult): asserts result is CommandError {
  expect(result.kind).toBe("error");
}

function createMockMetadata(overrides: Partial<SessionMetadata> = {}): SessionMetadata {
  const now = new Date("2026-04-04T12:00:00.000Z");
  return {
    id: `sess-${randomUUID()}`,
    title: "Test Session",
    createdAt: now,
    updatedAt: now,
    lastActive: now,
    status: "active",
    mode: "chat",
    tags: [],
    workingDirectory: "D:/Apps/vellum",
    tokenCount: 128,
    messageCount: 2,
    summary: "Session summary",
    ...overrides,
  };
}

function createMockSession(metadata: SessionMetadata): Session {
  return {
    metadata,
    messages: [],
    checkpoints: [],
    config: {},
  } as unknown as Session;
}

type MockStorage = StorageManager & {
  getIndex: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  loadArchivedSession: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  archiveSession: ReturnType<typeof vi.fn>;
  getArchivedSessions: ReturnType<typeof vi.fn>;
};

function createMockStorage(
  activeSessions: Session[],
  archivedSessions: Session[] = []
): MockStorage {
  const activeById = new Map(activeSessions.map((session) => [session.metadata.id, session]));
  const archivedById = new Map(archivedSessions.map((session) => [session.metadata.id, session]));

  return {
    getIndex: vi.fn().mockImplementation(async () => {
      return new Map(
        Array.from(activeById.values()).map((session) => [session.metadata.id, session.metadata])
      );
    }),
    load: vi.fn().mockImplementation(async (id: string) => {
      const session = activeById.get(id);
      if (!session) {
        throw new Error(`Session not found: ${id}`);
      }
      return session;
    }),
    loadArchivedSession: vi.fn().mockImplementation(async (id: string) => {
      const session = archivedById.get(id);
      if (!session) {
        throw new Error(`Archived session not found: ${id}`);
      }
      return session;
    }),
    delete: vi.fn().mockImplementation(async (id: string) => activeById.delete(id)),
    archiveSession: vi.fn().mockImplementation(async (id: string) => {
      const session = activeById.get(id);
      if (!session) {
        throw new Error(`Session not found: ${id}`);
      }
      activeById.delete(id);
      archivedById.set(
        id,
        createMockSession({
          ...session.metadata,
          status: "archived",
          updatedAt: new Date("2026-04-04T13:00:00.000Z"),
        })
      );
    }),
    getArchivedSessions: vi.fn().mockImplementation(async () => {
      return Array.from(archivedById.values()).map((session) => session.metadata);
    }),
  } as unknown as MockStorage;
}

function createMockListService(activeSessions: Session[]): SessionListService {
  const metadata = activeSessions.map((session) => session.metadata);

  return {
    listSessions: vi
      .fn()
      .mockImplementation(
        async (
          filter?: { status?: string | string[] },
          _sort?: unknown,
          pagination?: { pageSize?: number }
        ) => {
          let items = [...metadata];
          if (filter?.status) {
            const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
            items = items.filter((session) => statuses.includes(session.status));
          }

          items.sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
          const pageSize = pagination?.pageSize ?? items.length;

          return {
            items: items.slice(0, pageSize),
            total: items.length,
            page: 1,
            pageSize,
            hasMore: items.length > pageSize,
          };
        }
      ),
    getRecentSessions: vi
      .fn()
      .mockResolvedValue(
        [...metadata].sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime())
      ),
  } as unknown as SessionListService;
}

function createMockContext(overrides: Partial<ParsedArgs>, cwd: string): CommandContext {
  return {
    session: {
      id: "current-session",
      provider: "anthropic",
      cwd,
    },
    credentials: {
      resolve: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    } as unknown as CommandContext["credentials"],
    toolRegistry: {
      get: vi.fn(),
      list: vi.fn(),
    } as unknown as CommandContext["toolRegistry"],
    parsedArgs: {
      command: overrides.command ?? "session",
      positional: overrides.positional ?? [],
      named: overrides.named ?? {},
      raw: overrides.raw ?? "/session",
    },
    emit: vi.fn(),
  };
}

describe("session control plane commands", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "vellum-session-command-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("lists archived sessions when archived mode is requested", async () => {
    const active = createMockSession(
      createMockMetadata({
        id: "active-12345678-0000-0000-0000-000000000001",
        title: "Active Session",
      })
    );
    const archived = createMockSession(
      createMockMetadata({
        id: "archived-87654321-0000-0000-0000-000000000002",
        title: "Archived Session",
        status: "archived",
      })
    );
    const storage = createMockStorage([active], [archived]);
    const listService = createMockListService([active]);
    const command = createListCommand(storage, listService);

    const result = await command.execute(
      createMockContext(
        {
          command: "list",
          named: { archived: true, limit: 10 },
          raw: "/session list --archived",
        },
        tempDir
      )
    );

    assertSuccess(result);
    expect(result.message).toContain("Archived Sessions");
    expect(result.message).toContain("Archived Session");
  });

  it("shows active session details by short id", async () => {
    const session = createMockSession(
      createMockMetadata({
        id: "abc12345-0000-0000-0000-000000000003",
        title: "Debugging Session",
        summary: "Investigating a flaky test",
      })
    );
    const storage = createMockStorage([session]);
    const listService = createMockListService([session]);
    const command = createShowCommand(storage, listService);

    const result = await command.execute(
      createMockContext(
        {
          command: "show",
          positional: ["abc12345"],
          named: {},
          raw: "/session show abc12345",
        },
        tempDir
      )
    );

    assertSuccess(result);
    expect(result.message).toContain("Debugging Session");
    expect(result.message).toContain(session.metadata.id);
    expect(result.message).toContain("Working directory");
  });

  it("exports a session to a markdown file", async () => {
    const session = createMockSession(
      createMockMetadata({
        id: "export-12345678-0000-0000-0000-000000000004",
        title: "Export Me",
      })
    );
    const storage = createMockStorage([session]);
    const listService = createMockListService([session]);
    const command = createExportCommand(storage, listService);

    const result = await command.execute(
      createMockContext(
        {
          command: "export",
          positional: [session.metadata.id],
          named: {
            format: "markdown",
            output: "./session-export.md",
          },
          raw: `/session export ${session.metadata.id} --format=markdown --output=./session-export.md`,
        },
        tempDir
      )
    );

    assertSuccess(result);
    const exportedPath = join(tempDir, "session-export.md");
    const exportedContent = await readFile(exportedPath, "utf-8");

    expect(result.message).toContain(exportedPath);
    expect(exportedContent).toContain("Export Me");
    expect(exportedContent).toContain(session.metadata.id);
  });

  it("requires confirmation before deleting a session", async () => {
    const session = createMockSession(
      createMockMetadata({
        id: "delete-12345678-0000-0000-0000-000000000005",
        title: "Delete Candidate",
      })
    );
    const storage = createMockStorage([session]);
    const listService = createMockListService([session]);
    const command = createDeleteCommand(storage, listService);

    const result = await command.execute(
      createMockContext(
        {
          command: "delete",
          positional: [session.metadata.id],
          named: {},
          raw: `/session delete ${session.metadata.id}`,
        },
        tempDir
      )
    );

    assertInteractive(result);
    const confirmed = await result.prompt.handler("yes");
    assertSuccess(confirmed);

    expect(storage.delete).toHaveBeenCalledWith(session.metadata.id);
    expect(confirmed.message).toContain("Delete Candidate");
  });

  it("requires confirmation before archiving a session", async () => {
    const session = createMockSession(
      createMockMetadata({
        id: "archive-12345678-0000-0000-0000-000000000006",
        title: "Archive Candidate",
      })
    );
    const storage = createMockStorage([session]);
    const listService = createMockListService([session]);
    const command = createArchiveCommand(storage, listService);

    const result = await command.execute(
      createMockContext(
        {
          command: "archive",
          positional: [session.metadata.id],
          named: {},
          raw: `/session archive ${session.metadata.id}`,
        },
        tempDir
      )
    );

    assertInteractive(result);
    const confirmed = await result.prompt.handler("yes");
    assertSuccess(confirmed);

    expect(storage.archiveSession).toHaveBeenCalledWith(session.metadata.id);
    expect(confirmed.message).toContain("Archive Candidate");
  });

  it("dispatches archived list through the session parent command", async () => {
    const active = createMockSession(createMockMetadata({ title: "Active Session" }));
    const archived = createMockSession(
      createMockMetadata({
        id: "archived-list-12345678-0000-0000-0000-000000000007",
        title: "Archived From Parent",
        status: "archived",
      })
    );
    const storage = createMockStorage([active], [archived]);
    const listService = createMockListService([active]);
    const command = createSessionCommand(storage, listService);

    const result = await command.execute(
      createMockContext(
        {
          command: "session",
          positional: ["archived", "list"],
          named: {},
          raw: "/session archived list",
        },
        tempDir
      )
    );

    assertSuccess(result);
    expect(result.message).toContain("Archived Sessions");
    expect(result.message).toContain("Archived From Parent");
  });

  it("surfaces the scoped archived resume limitation clearly", async () => {
    const active = createMockSession(createMockMetadata({ title: "Active Session" }));
    const storage = createMockStorage([active]);
    const listService = createMockListService([active]);
    const command = createSessionCommand(storage, listService);

    const result = await command.execute(
      createMockContext(
        {
          command: "session",
          positional: ["archived", "resume", "abc12345"],
          named: {},
          raw: "/session archived resume abc12345",
        },
        tempDir
      )
    );

    assertError(result);
    expect(result.message).toContain("not supported yet");
  });
});
